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
// 生命週期（2026-08-20 改）：**30 天**，跨分頁、跨重新整理都保留。
//
// 原本是「關掉分頁就失效」（sessionStorage 標記 ＋ IndexedDB 金鑰）。改的原因是收案動線要移到平板：
// 門診中平板開開關關，每次都要重打通行碼，實務上會逼人把通行碼寫在便條紙上——那比放寬期限更危險。
//
// 代價要講清楚：平板遺失時，撿到的人在剩餘效期內開得了對照表。緩解有三層——
//   1. 金鑰是 extractable:false，帶不走、也導不出通行碼
//   2. 平台本身還有共用密碼那道門
//   3. 保管庫面板有「立即鎖定」，平板要借人或送修時先按
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

import type { MrnMappingRow } from "./localMrnStore";
import { encryptRowsWithDek, decryptRowsWithDek, isV2, type AnyVault } from "./mrnVault";
import { saveVaultAction, loadVaultAction } from "@/app/local-tools/mrn-mapping/vaultActions";

const DB_NAME = "keloid-vault-session";
const STORE_NAME = "session-key";
const RECORD_KEY = "default";
interface StoredKey {
  /** v2 起存的是 DEK（資料金鑰），不再是通行碼導出的金鑰——換通行碼不必重新解鎖每台裝置 */
  key: CryptoKey;
  /**
   * 這把 DEK 對應的是哪一份保管庫：取 `wraps.passphrase.salt`。
   * 一般的收案同步只換內容與 IV，wraps 不動，所以這個值穩定；
   * 只有「建立」或「重設通行碼」會換掉它——那兩件事本來就必須重新解鎖。
   */
  fingerprint: string;
  /** epoch ms；過了就當沒解鎖並清掉 */
  expiresAt: number;
}

export { SESSION_TTL_MS };

export interface UnlockedVaultKey {
  key: CryptoKey;
  fingerprint: string;
}

/** 保管庫的身分指紋：手上的金鑰還對不對得上雲端那一份。 */
export function vaultFingerprint(vault: AnyVault): string {
  return isV2(vault) ? vault.wraps.passphrase.salt : (vault as { salt: string }).salt;
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

/** 記住這把金鑰 30 天。 */
export async function rememberVaultKey(key: CryptoKey, fingerprint: string): Promise<void> {
  await putRecord({ key, fingerprint, expiresAt: Date.now() + SESSION_TTL_MS });
  notify();
}

/** 取回金鑰；過期就順手清掉並回傳 null。 */
export async function getVaultKey(): Promise<UnlockedVaultKey | null> {
  try {
    const record = await readRecord();
    if (!record) return null;
    if (!record.expiresAt || record.expiresAt <= Date.now()) {
      await putRecord(null);
      notify();
      return null;
    }
    return { key: record.key, fingerprint: record.fingerprint };
  } catch {
    return null;
  }
}

/** 解鎖還剩幾天（供畫面提示）；未解鎖回 null。 */
export async function getVaultKeyDaysLeft(): Promise<number | null> {
  try {
    const record = await readRecord();
    if (!record?.expiresAt || record.expiresAt <= Date.now()) return null;
    return Math.ceil((record.expiresAt - Date.now()) / 86_400_000);
  } catch {
    return null;
  }
}

export async function forgetVaultKey(): Promise<void> {
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
 * 寫回雲端時要把既有的 `wraps` 原樣帶著——那兩份被包住的 DEK 是保管庫的鑰匙孔，
 * 掉了就等於把通行碼與救援碼一起作廢。內容每次都換新的 IV（AES-GCM 的要求）。
 */
function v2Payload(existing: AnyVault, content: { ciphertext: string; iv: string; row_count: number }) {
  // 舊格式沒有 wraps，寫不回去。這裡不自作主張升級——升級要有通行碼，而收案當下沒有。
  // 使用者到對照表頁解鎖一次就會自動升級（見 VaultPanel.handleUnlock），所以訊息直接指路。
  if (!isV2(existing)) {
    throw new Error("保管庫是舊格式，請到「病歷號對照維護」用通行碼解鎖一次（會自動升級並產生救援碼），之後就會正常寫入");
  }
  return { ...content, format: 2 as const, wraps: existing.wraps };
}

/** 手上的金鑰對不對得上雲端那一份；對不上就不能寫，否則會蓋掉別人的內容。 */
function staleKeyMessage(existing: AnyVault, held: UnlockedVaultKey): string | null {
  if (vaultFingerprint(existing) === held.fingerprint) return null;
  return "保管庫已被其他裝置重新建立或重設通行碼，請先到「病歷號對照維護」重新解鎖再收案";
}

/**
 * 若保管庫已解鎖，就用整份對照表重新加密覆蓋雲端。
 *
 * 保管庫是單一 blob，沒有「只上傳一筆」這回事——每次同步都是整包重寫（百來筆約 20KB，成本可忽略）。
 * 沒解鎖就回 "locked"，呼叫端據此顯示待同步提示，不擋收案動線。
 */
export async function syncVaultIfUnlocked(
  rows: MrnMappingRow[]
): Promise<{ status: "synced" | "locked" | "failed"; message?: string }> {
  const held = await getVaultKey();
  if (!held) return { status: "locked" };
  try {
    const existing = (await loadVaultAction()) as AnyVault | null;
    if (!existing) return { status: "failed", message: "雲端還沒有保管庫，請先建立" };
    const stale = staleKeyMessage(existing, held);
    if (stale) return { status: "failed", message: stale };

    // ⚠️ 不准用「空的」蓋掉「有內容的」（2026-08-25）。
    // 這支是拿整份本機 CSV 覆蓋雲端，而本機 CSV 可能是剛建立的空檔、或這台裝置根本讀不到內容。
    // 實際踩到過：手機端每收一筆案就把 0 筆的 CSV 整份蓋回去，保管庫因此一直是 0 筆。
    // 覆蓋是不可逆的（舊內容要靠版本快照才救得回），所以寧可擋下來要求明確操作。
    if (rows.length === 0 && existing.row_count > 0) {
      return {
        status: "failed",
        message: `本機對照表讀到 0 筆，若寫上去會清空雲端現有的 ${existing.row_count} 筆，已停止。請確認本機對照表檔案選對了。`,
      };
    }

    const content = await encryptRowsWithDek(rows, held.key);
    const result = await saveVaultAction(v2Payload(existing, content));
    if (!result.ok) return { status: "failed", message: result.message };
    return { status: "synced" };
  } catch (err) {
    return { status: "failed", message: err instanceof Error ? err.message : "同步失敗" };
  }
}

/**
 * 把一筆對照寫進保管庫（決策 2026-08-20：平板收案時，保管庫取代本機 CSV 當權威來源）。
 *
 * 保管庫是單一 blob，沒有「只加一筆」這回事——必須整份解密、加一筆、整份重新加密再覆蓋。
 * 百來筆約 20KB，成本可忽略。同一個研究編號重複寫入時取代舊的，不留重複列。
 */
export async function appendRowToVault(
  row: MrnMappingRow
): Promise<{ status: "saved" | "locked" | "failed"; message?: string; total?: number }> {
  const held = await getVaultKey();
  if (!held) return { status: "locked" };
  try {
    const existing = (await loadVaultAction()) as AnyVault | null;
    if (!existing) return { status: "failed", message: "雲端還沒有保管庫，請先建立" };
    const stale = staleKeyMessage(existing, held);
    if (stale) return { status: "failed", message: stale };

    let rows = await decryptRowsWithDek(existing, held.key);
    rows = rows.filter((r) => r.research_id !== row.research_id);
    rows.push(row);
    const content = await encryptRowsWithDek(rows, held.key);
    const result = await saveVaultAction(v2Payload(existing, content));
    if (!result.ok) return { status: "failed", message: result.message };
    return { status: "saved", total: rows.length };
  } catch (err) {
    return { status: "failed", message: err instanceof Error ? err.message : "寫入保管庫失敗" };
  }
}

/**
 * 讀出保管庫裡的全部對照（2026-08-20，收案前的病歷號重複檢查用）。
 *
 * 平板沒有本機 CSV 可讀，重複檢查的唯一資料來源就是保管庫。
 * 沒解鎖時回 null 而不是空陣列——「查不到」與「確定沒有」必須分得出來，
 * 否則鎖著的保管庫會讓每一筆重複都變成「沒撞到」而放行。
 */
export async function readVaultRows(): Promise<MrnMappingRow[] | null> {
  const held = await getVaultKey();
  if (!held) return null;
  const existing = (await loadVaultAction()) as AnyVault | null;
  if (!existing) return [];
  // 別台裝置重新建立或重設過通行碼，手上的金鑰對不上——回 null＝「查不到」，不是「確定沒有」
  if (vaultFingerprint(existing) !== held.fingerprint) return null;
  try {
    return await decryptRowsWithDek(existing, held.key);
  } catch {
    return null;
  }
}
