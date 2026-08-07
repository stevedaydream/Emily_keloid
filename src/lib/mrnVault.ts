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

// 通行碼強度：保管庫的安全性完全繫於這串字，弱通行碼等於沒加密（密文是公開可讀的）。
export function passphraseIssue(passphrase: string): string | null {
  if (passphrase.length < 12) return "通行碼至少要 12 個字元（保管庫的安全性完全取決於這串字）";
  if (/^\d+$/.test(passphrase)) return "不要只用數字，請混合英文字母或符號";
  return null;
}
