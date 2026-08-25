import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { supabaseServer } from "@/lib/supabase";

// 匯出金鑰（2026-08-25）。
//
// 背景：病歷號與姓名改為明文存在 `cases` 裡（廢除本機對照表與零知識保管庫，
// 見 migration 20260825050000）。取而代之的保護是——**匯出檔預設不含那兩欄，
// 要帶出來必須輸入金鑰**。
//
// ⚠️ 必須誠實看待這道保護擋得住什麼：
//   · 擋得住：有人隨手下載一份檔案帶出去、或匯出檔在信箱／隨身碟裡外流時多一層門檻。
//   · **擋不住**：資料庫本身就是明文。拿得到 Supabase 金鑰的人直接讀表就有了。
// 也就是說它保護的是「檔案」，不是「資料」。Phase 1 送 IRB 要照這個講法寫。
//
// 金鑰本身不存明文，只存 SHA-256(salt + key)。忘記時用救援碼重設（同一套雜湊比對）。

const KEY_HASH = "export_identified_key_hash";
const KEY_SALT = "export_identified_key_salt";
const RECOVERY_HASH = "export_identified_recovery_hash";

function hash(salt: string, secret: string): string {
  return createHash("sha256").update(`${salt}:${secret}`).digest("hex");
}

/** 常數時間比對，避免用回應時間一個位元一個位元試出金鑰。 */
function sameHash(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

async function readSetting(key: string): Promise<string | null> {
  const supabase = supabaseServer();
  const { data } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  const v = data?.value;
  return typeof v === "string" ? v : null;
}

async function writeSetting(key: string, value: string, operator: string): Promise<void> {
  const supabase = supabaseServer();
  await supabase
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: operator }, { onConflict: "key" });
}

export async function exportKeyIsSet(): Promise<boolean> {
  return (await readSetting(KEY_HASH)) !== null;
}

/** 產生救援碼：24 碼，字母表拿掉手抄會看錯的 0/O/1/I/L。 */
export function newExportRecoveryCode(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = randomBytes(24);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return (chars.join("").match(/.{1,4}/g) ?? []).join("-");
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/**
 * 設定（或重設）匯出金鑰，並產生一組新的救援碼。
 * 回傳的救援碼**只有這一次拿得到**，平台只留它的雜湊。
 */
export async function setExportKey(key: string, operator: string): Promise<{ recoveryCode: string }> {
  const salt = randomBytes(16).toString("hex");
  const recoveryCode = newExportRecoveryCode();
  await writeSetting(KEY_SALT, salt, operator);
  await writeSetting(KEY_HASH, hash(salt, key), operator);
  await writeSetting(RECOVERY_HASH, hash(salt, normalizeCode(recoveryCode)), operator);
  return { recoveryCode };
}

/** 金鑰對不對。沒設定過一律回 false——沒設定就不該有人匯得出可識別欄位。 */
export async function verifyExportKey(key: string): Promise<boolean> {
  const [salt, expected] = await Promise.all([readSetting(KEY_SALT), readSetting(KEY_HASH)]);
  if (!salt || !expected || !key) return false;
  return sameHash(hash(salt, key), expected);
}

/** 救援碼對不對（用來重設金鑰）。 */
export async function verifyExportRecoveryCode(code: string): Promise<boolean> {
  const [salt, expected] = await Promise.all([readSetting(KEY_SALT), readSetting(RECOVERY_HASH)]);
  if (!salt || !expected || !code) return false;
  return sameHash(hash(salt, normalizeCode(code)), expected);
}
