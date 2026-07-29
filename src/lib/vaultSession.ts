"use client";

// 保管庫「本次工作階段解鎖」狀態。
//
// 目的：讓新增個案時能自動把對照表重新加密上傳，而不用每建一筆就打一次通行碼。
//
// 為什麼存的是金鑰而不是通行碼：
// deriveVaultKey 產出的 CryptoKey 是 extractable: false，而 CryptoKey 本身可以被
// structured clone 進 IndexedDB。因此我們存得進去、用得到，卻**匯不出原始金鑰材料**——
// 就算之後真的中了 XSS，攻擊者頂多能在這個瀏覽器上用它，拿不到通行碼、也帶不走鑰匙。
// 通行碼在導出金鑰之後就丟掉，從頭到尾沒有以可讀形式落地過。
//
// 生命週期（使用者選擇 2026-07-29）：跨重新整理保留，關掉分頁就失效。
// 作法是 IndexedDB 存金鑰、sessionStorage 存一個隨機標記，兩者對得上才承認。
// 分頁關閉時 sessionStorage 自動清空 → 標記消失 → 金鑰再也對不上，並於下次載入時刪除。
// （單用 IndexedDB 會活太久，單用 sessionStorage 又只能存字串＝被迫存通行碼。）

import type { MrnMappingRow } from "./localMrnStore";
import { encryptWithKey } from "./mrnVault";
import { saveVaultAction } from "@/app/local-tools/mrn-mapping/vaultActions";

const DB_NAME = "keloid-vault-session";
const STORE_NAME = "session-key";
const RECORD_KEY = "default";
const MARKER_KEY = "keloid_vault_marker";

interface StoredKey {
  key: CryptoKey;
  salt: string;
  iterations: number;
  marker: string;
}

export interface UnlockedVaultKey {
  key: CryptoKey;
  salt: string;
  iterations: number;
}

// 刻意用獨立的資料庫，不併進 localMrnStore 的 keloid-local-tools：
// 那邊是 version 1，加一個 object store 就要升版，而升版後舊的 open(1) 會直接拋 VersionError。
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putRecord(record: StoredKey | null): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    if (record) store.put(record, RECORD_KEY);
    else store.delete(RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function readRecord(): Promise<StoredKey | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
    req.onsuccess = () => resolve((req.result as StoredKey) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** 記住這把金鑰，直到分頁關閉。 */
export async function rememberVaultKey(key: CryptoKey, salt: string, iterations: number): Promise<void> {
  const marker = crypto.randomUUID();
  window.sessionStorage.setItem(MARKER_KEY, marker);
  await putRecord({ key, salt, iterations, marker });
  notify();
}

/** 取回本次工作階段的金鑰；標記對不上（＝分頁曾關閉）就順手清掉並回傳 null。 */
export async function getVaultKey(): Promise<UnlockedVaultKey | null> {
  try {
    const record = await readRecord();
    if (!record) return null;
    const marker = window.sessionStorage.getItem(MARKER_KEY);
    if (!marker || marker !== record.marker) {
      await putRecord(null);
      return null;
    }
    return { key: record.key, salt: record.salt, iterations: record.iterations };
  } catch {
    return null;
  }
}

export async function forgetVaultKey(): Promise<void> {
  window.sessionStorage.removeItem(MARKER_KEY);
  await putRecord(null);
  notify();
}

// 解鎖狀態變動時讓畫面上的指示燈跟著更新（同一分頁內）。
type Listener = () => void;
const listeners = new Set<Listener>();
function notify() {
  for (const l of listeners) l();
}
export function subscribeVaultSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * 若保管庫已解鎖，就用整份對照表重新加密覆蓋雲端。
 *
 * 保管庫是單一 blob，沒有「只上傳一筆」這回事——每次同步都是整包重寫（百來筆約 20KB，成本可忽略）。
 * 重複使用同一組 salt（金鑰是綁著 salt 導出的，換 salt 就要重打通行碼），但**每次都換新的 IV**，
 * 這正是 AES-GCM 的要求；salt 的作用是擋 KDF 的預先計算，不需要每次更換。
 *
 * 沒解鎖就回 "locked"，呼叫端據此顯示待同步提示，不擋收案動線。
 */
export async function syncVaultIfUnlocked(
  rows: MrnMappingRow[]
): Promise<{ status: "synced" | "locked" | "failed"; message?: string }> {
  const held = await getVaultKey();
  if (!held) return { status: "locked" };
  try {
    const payload = await encryptWithKey(rows, held.key, held.salt, held.iterations);
    const result = await saveVaultAction(payload);
    if (!result.ok) return { status: "failed", message: result.message };
    return { status: "synced" };
  } catch (err) {
    return { status: "failed", message: err instanceof Error ? err.message : "同步失敗" };
  }
}
