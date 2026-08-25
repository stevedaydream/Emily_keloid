"use client";

// 病歷號對照表的「雲端加密保管庫」——加解密全部在瀏覽器端完成。
//
// 為什麼可以放上雲端而不違反決策 #1：
// 決策 #1 的紅線是「病歷號不以明文離開診間」，不是「不准用雲端」。這裡上傳的是
// AES-GCM 密文，**通行碼永遠不離開瀏覽器**（不進網路請求、不進 log、不進資料庫），
// 伺服器與資料庫拿到的自始至終都是一團無意義的 base64。因此就算 Supabase 的
// anon key 外洩、或整個資料庫被匯出，也拿不到任何一個病歷號。
//
// 相對的代價：**通行碼遺失就解不開**。伺服器沒有備份、也沒有「忘記密碼」可以走，
// 這是零知識設計的必然結果。所以本機 CSV 仍然是正本，保管庫是為了讓手機／平板
// （沒有 File System Access API，掛不上本機檔案）也能查到對照。
//
// 演算法：PBKDF2-HMAC-SHA256（310,000 次，OWASP 2023 建議值）導出 AES-GCM 256 位元金鑰。
// 每次儲存都重新產生 salt 與 iv，避免同一把金鑰重複使用同一個 iv。

import type { MrnMappingRow } from "./localMrnStore";

const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedVault {
  ciphertext: string;
  salt: string;
  iv: string;
  iterations: number;
  row_count: number;
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** 新建保管庫時用的隨機 salt（base64）。之後重新加密都沿用同一組，見 encryptWithKey。 */
export function newSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/**
 * 從通行碼導出 AES-GCM 金鑰。
 *
 * extractable 固定為 false：這把金鑰可以被 structured clone 存進 IndexedDB 重複使用
 * （見 vaultSession.ts），但任何人都匯不出它的原始材料，通行碼也就不必留在任何地方。
 */
export async function deriveVaultKey(passphrase: string, salt: string, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromBase64(salt) as BufferSource, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// 對照表在保管庫裡就是一份 JSON 陣列（欄位與本機 CSV 相同）。
//
// salt 由呼叫端帶入而不是每次重新產生：自動同步時金鑰是快取的，而金鑰綁著導出它的那組 salt，
// 換 salt 就等於要重打通行碼。salt 的用途是擋 KDF 的預先計算表，不需要每次更換；
// 真正每次都必須換的是 iv，這裡照做。
export async function encryptWithKey(
  rows: MrnMappingRow[],
  key: CryptoKey,
  salt: string,
  iterations: number
): Promise<EncryptedVault> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(rows));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plaintext);
  return {
    ciphertext: toBase64(ciphertext),
    salt,
    iv: toBase64(iv),
    iterations,
    row_count: rows.length,
  };
}

export async function decryptWithKey(vault: EncryptedVault, key: CryptoKey): Promise<MrnMappingRow[]> {
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(vault.iv) as BufferSource },
      key,
      fromBase64(vault.ciphertext) as BufferSource
    );
  } catch {
    // AES-GCM 的驗證標籤對不上：通行碼錯誤，或密文在傳輸/儲存過程被竄改。
    throw new Error("通行碼錯誤，或這份保管庫已損毀");
  }
  const parsed = JSON.parse(new TextDecoder().decode(plaintext));
  if (!Array.isArray(parsed)) throw new Error("保管庫內容格式不正確");
  return parsed as MrnMappingRow[];
}

export async function encryptRows(rows: MrnMappingRow[], passphrase: string): Promise<EncryptedVault> {
  const salt = newSalt();
  const key = await deriveVaultKey(passphrase, salt, PBKDF2_ITERATIONS);
  return encryptWithKey(rows, key, salt, PBKDF2_ITERATIONS);
}

export async function decryptRows(vault: EncryptedVault, passphrase: string): Promise<MrnMappingRow[]> {
  const key = await deriveVaultKey(passphrase, vault.salt, vault.iterations || PBKDF2_ITERATIONS);
  return decryptWithKey(vault, key);
}

export { PBKDF2_ITERATIONS };

// ─────────────────────────────────────────────────────────────────────────────
// 保管庫格式 v2：雙金鑰（通行碼／救援碼），2026-08-25 使用者要求「忘記通行碼要救得回來」
// ─────────────────────────────────────────────────────────────────────────────
//
// v1 的問題：通行碼**直接**導出加密內容的金鑰，所以忘記＝永久解不開，連換通行碼都做不到
// （換一組就等於整份重新加密，而那需要先解得開）。
//
// v2 改成兩層：
//
//     隨機產生一把資料金鑰 DEK  ──►  對照表內容用 DEK 加密
//     DEK 用「通行碼」導出的金鑰包一份  ┐ 兩份都存在保管庫裡，
//     DEK 用「救援碼」導出的金鑰包一份  ┘ 任何一把都能解開同一個 DEK
//
// 於是：忘記通行碼 → 用救援碼解開 DEK → 重設新通行碼（重新包一份）→ 內容完全不用動。
// 換通行碼也不再需要重新加密整份內容。
//
// 救援碼是系統產生的 120 bit 隨機碼，只在建立當下顯示一次，由使用者自行保管
// （下載 pwbak.json／寄到信箱）。平台**不留任何副本**——留了就等於門鎖旁邊掛鑰匙。

/** 救援碼的字母表：拿掉 0/O/1/I/L 這些手抄會看錯的字元（Crockford Base32 的做法）。 */
const RECOVERY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const RECOVERY_CHARS = 24; // 24 × log2(31) ≈ 119 bit

/** 產生救援碼，每 4 碼一組以便手抄／唸給人聽。 */
export function newRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_CHARS));
  const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]);
  return (chars.join("").match(/.{1,4}/g) ?? []).join("-");
}

/** 使用者可能連字號打錯、貼上時多了空白、或用小寫抄——正規化之後再比對。 */
export function normalizeRecoveryCode(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** 一把金鑰（通行碼或救援碼）包住 DEK 的結果。 */
export interface DekWrap {
  salt: string;
  iv: string;
  iterations: number;
  wrapped: string;
}

export interface EncryptedVaultV2 {
  format: 2;
  ciphertext: string;
  iv: string;
  row_count: number;
  wraps: { passphrase: DekWrap; recovery: DekWrap };
}

/** 舊格式仍讀得動（保管庫在改版當下是空的，但別台裝置可能剛好建了一份 v1）。 */
export type AnyVault = (EncryptedVault & { format?: 1 }) | EncryptedVaultV2;

export function isV2(v: AnyVault): v is EncryptedVaultV2 {
  return (v as EncryptedVaultV2).format === 2;
}

async function deriveWrappingKey(secret: string, salt: string, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromBase64(salt) as BufferSource, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

/** 用某個祕密（通行碼或救援碼）把 DEK 包起來。每一份 wrap 各有自己的 salt 與 iv。 */
async function wrapDek(dek: CryptoKey, secret: string): Promise<DekWrap> {
  const salt = newSalt();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const kek = await deriveWrappingKey(secret, salt, PBKDF2_ITERATIONS);
  const wrapped = await crypto.subtle.wrapKey("raw", dek, kek, { name: "AES-GCM", iv: iv as BufferSource });
  return { salt, iv: toBase64(iv), iterations: PBKDF2_ITERATIONS, wrapped: toBase64(wrapped) };
}

/**
 * 解開 DEK。取出來的金鑰是 **extractable: false**——之後存進 IndexedDB 重複使用時，
 * 任何 JS 都匯不出它的原始材料（沿用 v1 對 deriveVaultKey 的同一個原則）。
 */
async function unwrapDek(wrap: DekWrap, secret: string): Promise<CryptoKey> {
  const kek = await deriveWrappingKey(secret, wrap.salt, wrap.iterations || PBKDF2_ITERATIONS);
  return crypto.subtle.unwrapKey(
    "raw",
    fromBase64(wrap.wrapped) as BufferSource,
    kek,
    { name: "AES-GCM", iv: fromBase64(wrap.iv) as BufferSource },
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** 建立新的保管庫（v2）。回傳密文與兩份 wrap；救援碼由呼叫端顯示給使用者保管。 */
export async function createVault(
  rows: MrnMappingRow[],
  passphrase: string,
  recoveryCode: string
): Promise<{ payload: EncryptedVaultV2; dek: CryptoKey }> {
  // 包裝金鑰時 DEK 必須是可匯出的（wrapKey 的規定），包完就丟掉這個 handle，
  // 改用 unwrap 出來的那把不可匯出的版本給後續使用。
  const extractableDek = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const wraps = {
    passphrase: await wrapDek(extractableDek, passphrase),
    recovery: await wrapDek(extractableDek, normalizeRecoveryCode(recoveryCode)),
  };
  const dek = await unwrapDek(wraps.passphrase, passphrase);
  const { ciphertext, iv } = await encryptRowsWithDek(rows, dek);
  return { payload: { format: 2, ciphertext, iv, row_count: rows.length, wraps }, dek };
}

/** 內容加密／解密一律用 DEK（跟通行碼無關，所以換通行碼不必重新加密整份）。 */
export async function encryptRowsWithDek(
  rows: MrnMappingRow[],
  dek: CryptoKey
): Promise<{ ciphertext: string; iv: string; row_count: number }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(rows));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, dek, plaintext);
  return { ciphertext: toBase64(ciphertext), iv: toBase64(iv), row_count: rows.length };
}

export async function decryptRowsWithDek(
  vault: { ciphertext: string; iv: string },
  dek: CryptoKey
): Promise<MrnMappingRow[]> {
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(vault.iv) as BufferSource },
      dek,
      fromBase64(vault.ciphertext) as BufferSource
    );
  } catch {
    throw new Error("保管庫已損毀或金鑰不符");
  }
  const parsed = JSON.parse(new TextDecoder().decode(plaintext));
  if (!Array.isArray(parsed)) throw new Error("保管庫內容格式不正確");
  return parsed as MrnMappingRow[];
}

/** 用通行碼解鎖，取得 DEK。錯的通行碼會在 unwrap 時被 AES-GCM 的驗證標籤擋下。 */
export async function unlockWithPassphrase(vault: EncryptedVaultV2, passphrase: string): Promise<CryptoKey> {
  try {
    return await unwrapDek(vault.wraps.passphrase, passphrase);
  } catch {
    throw new Error("通行碼錯誤");
  }
}

/** 用救援碼解鎖，取得 DEK。 */
export async function unlockWithRecovery(vault: EncryptedVaultV2, recoveryCode: string): Promise<CryptoKey> {
  try {
    return await unwrapDek(vault.wraps.recovery, normalizeRecoveryCode(recoveryCode));
  } catch {
    throw new Error("救援碼不正確");
  }
}

// 重設通行碼刻意**不做**「拿舊 DEK 重新包一份」：unwrap 出來的 DEK 是 extractable:false，
// 包不了（wrapKey 規定被包的金鑰要可匯出）。真要包就得讓工作階段的金鑰變成可匯出，
// 為了省一次重新加密而放寬金鑰的匯出限制並不划算。
//
// 所以重設走的是「解開內容 → 產生全新的 DEK → 重新加密 → 包兩份新的」，
// 也就是直接呼叫 createVault()。百來筆約 20KB，成本可忽略；而且救援事件之後換掉 DEK，
// 本來就是比較健康的做法（舊救援碼從此完全失效）。

/**
 * 用通行碼打開保管庫，回傳內容與後續要用的金鑰。
 *
 * 同時吃 v1 與 v2：v1 的通行碼直接就是內容金鑰，v2 的通行碼是用來解開 DEK 的。
 * 呼叫端不必判斷格式——只有「要不要提供救援」這件事需要知道格式（v1 沒有救援碼）。
 */
export async function openVaultWithPassphrase(
  vault: AnyVault,
  passphrase: string
): Promise<{ rows: MrnMappingRow[]; dek: CryptoKey; fingerprint: string }> {
  if (isV2(vault)) {
    const dek = await unlockWithPassphrase(vault, passphrase);
    return { rows: await decryptRowsWithDek(vault, dek), dek, fingerprint: vault.wraps.passphrase.salt };
  }
  const v1 = vault as EncryptedVault;
  const key = await deriveVaultKey(passphrase, v1.salt, v1.iterations || PBKDF2_ITERATIONS);
  return { rows: await decryptWithKey(v1, key), dek: key, fingerprint: v1.salt };
}

/** 救援備份檔（pwbak.json）的內容。平台不留副本，這份檔案就是使用者手上的唯一備份。 */
export interface RecoveryBackup {
  kind: "keloid-mrn-vault-recovery";
  version: 2;
  recovery_code: string;
  /** 對得上哪一份保管庫（救援碼那份 wrap 的 salt）。換過通行碼之後舊檔就對不上了，可據此提醒。 */
  vault_fingerprint: string;
  created_at: string;
  note: string;
}

export function buildRecoveryBackup(recoveryCode: string, vault: EncryptedVaultV2, createdAt: string): RecoveryBackup {
  return {
    kind: "keloid-mrn-vault-recovery",
    version: 2,
    recovery_code: recoveryCode,
    vault_fingerprint: vault.wraps.recovery.salt,
    created_at: createdAt,
    note: "蟹足腫研究平台－病歷號對照保管庫的救援碼。忘記通行碼時可用它還原並重設通行碼。這份檔案等同鑰匙，請與病歷號資料分開保存。",
  };
}

/** 讀 pwbak.json，只取救援碼；格式不對就講清楚哪裡不對，不要讓使用者猜。 */
export function parseRecoveryBackup(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("這不是有效的 JSON 檔案");
  }
  const b = parsed as Partial<RecoveryBackup>;
  if (b?.kind !== "keloid-mrn-vault-recovery") throw new Error("這不是本平台的救援備份檔（pwbak.json）");
  if (typeof b.recovery_code !== "string" || !b.recovery_code.trim()) throw new Error("備份檔裡沒有救援碼");
  return b.recovery_code;
}

// 通行碼強度：保管庫的安全性完全繫於這串字，弱通行碼等於沒加密（密文是公開可讀的）。
export function passphraseIssue(passphrase: string): string | null {
  if (passphrase.length < 12) return "通行碼至少要 12 個字元（保管庫的安全性完全取決於這串字）";
  if (/^\d+$/.test(passphrase)) return "不要只用數字，請混合英文字母或符號";
  return null;
}
