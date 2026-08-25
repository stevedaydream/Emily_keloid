import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase";

// 系統管理者 PIN（2026-08-25，pending.md G3）。
//
// 使用者要求：正式上線後，切換成「系統管理者」這個操作者要輸入 PIN。
// 擋的是「測試模式開關」「刪除所有測試個案」「匯出金鑰」這類維運工具——
// 它們一鍵就能影響全站資料，不該讓任何拿到共用帳號的人隨手點到。
//
// ⚠️ 這仍然不是完整的權限系統（決策 #9：全體共用一組帳號）。
// 它擋的是「誤觸」與「順手看看」，擋不住刻意繞路的人。IRB 文件要照這個講法寫。
//
// **沒設定 PIN 時完全不擋**——demo/教育訓練期間不必先設一組密碼才能用，
// 正式上線那天到 /admin/admin-pin 設定即可生效。

const PIN_HASH = "admin_pin_hash";
const PIN_SALT = "admin_pin_salt";

/** 通過驗證後放的 cookie；跟操作者 cookie 同壽命（12 小時），關掉瀏覽器不會留著。 */
export const ADMIN_PIN_COOKIE = "keloid_admin_pin";

function hash(salt: string, secret: string): string {
  return createHash("sha256").update(`${salt}:${secret}`).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

async function readSetting(key: string): Promise<string | null> {
  const supabase = supabaseServer();
  const { data } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  return typeof data?.value === "string" ? data.value : null;
}

async function writeSetting(key: string, value: string | null, operator: string): Promise<void> {
  const supabase = supabaseServer();
  await supabase
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: operator }, { onConflict: "key" });
}

export async function adminPinIsSet(): Promise<boolean> {
  return (await readSetting(PIN_HASH)) !== null;
}

/** 設定（或更換）PIN。舊的 PIN cookie 會因為 salt 換掉而自然失效。 */
export async function setAdminPin(pin: string, operator: string): Promise<void> {
  const salt = randomBytes(16).toString("hex");
  await writeSetting(PIN_SALT, salt, operator);
  await writeSetting(PIN_HASH, hash(salt, pin), operator);
}

/** 取消 PIN（回到不擋的狀態）。 */
export async function clearAdminPin(operator: string): Promise<void> {
  await writeSetting(PIN_HASH, null, operator);
  await writeSetting(PIN_SALT, null, operator);
}

export async function verifyAdminPin(pin: string): Promise<boolean> {
  const [salt, expected] = await Promise.all([readSetting(PIN_SALT), readSetting(PIN_HASH)]);
  if (!salt || !expected || !pin) return false;
  return sameHash(hash(salt, pin), expected);
}

/** cookie 裡那把是不是目前這組 PIN 的憑證。換過 PIN 之後舊 cookie 就對不上了。 */
export async function hasValidAdminPinCookie(): Promise<boolean> {
  const expected = await readSetting(PIN_HASH);
  if (!expected) return true; // 沒設定 PIN＝不擋
  const token = (await cookies()).get(ADMIN_PIN_COOKIE)?.value;
  return Boolean(token) && sameHash(token as string, expected);
}

/** 驗證通過後拿來放 cookie 的值——就是那串雜湊，換 PIN 立刻作廢。 */
export async function adminPinCookieValue(): Promise<string | null> {
  return readSetting(PIN_HASH);
}

/**
 * 可不可以用維運工具（測試模式、清除測試個案、匯出金鑰、PIN 設定）。
 *
 * 兩個條件：是系統管理者，而且（若有設 PIN）這個瀏覽器通過過 PIN 驗證。
 * 第二個條件是為了堵住「PIN 設定之前就已經切成系統管理者」的那段舊 session——
 * 設了 PIN 之後，那些 session 下一次進維運工具就會被要求重新驗證。
 */
export async function canUseMaintenanceTools(): Promise<{ ok: boolean; reason: "not_admin" | "need_pin" | null }> {
  const { getCurrentOperatorContext } = await import("@/lib/operator");
  const ctx = await getCurrentOperatorContext();
  if (ctx && !ctx.isSystemAdmin) return { ok: false, reason: "not_admin" };
  if (!(await hasValidAdminPinCookie())) return { ok: false, reason: "need_pin" };
  return { ok: true, reason: null };
}
