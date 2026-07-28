"use client";

// 病歷號 <-> 研究編號對照表：全程只在瀏覽器本機執行，透過 File System Access API
// 直接讀寫使用者選定的本機 CSV 檔案，這段程式碼「不會」對任何伺服器（含本平台的 Vercel/Supabase）
// 發出任何網路請求，病歷號因此完全不會離開這台電腦。
//
// ⚠️ 僅支援**桌機版** Chrome / Edge。手機與平板（Android Chrome、iPad Safari/Chrome）
// 都沒有實作 File System Access API，那是瀏覽器本身的限制，不是權限設定問題。
//
// 刻意不做行動版的替代方案：用 <input type="file"> 是讀得到 CSV，但拿不到可持續的
// handle，重新整理就沒了，要能用就得把「病歷號＋姓名」快取進該裝置的 IndexedDB——
// 而平板是要交到病人手上的（見 pending.md C1b：Phase 0 沒有裝置隔離），
// 等於在最不該留身分資料的裝置上留一份。所以行動裝置一律不掛對照表。

const DB_NAME = "keloid-local-tools";
const STORE_NAME = "handles";
const HANDLE_KEY = "mrn-mapping-file";
// 第 5 欄 name 是 2026-07-28 才加的（決策：姓名跟病歷號一樣只留本機，雲端永遠不存）。
// 舊檔案只有 4 欄也讀得動，name 會是空字串。
const CSV_HEADER = "mrn,research_id,case_id,created_at,name";

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveHandle(handle: FileSystemFileHandle): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadHandle(): Promise<FileSystemFileHandle | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
    req.onsuccess = () => resolve((req.result as FileSystemFileHandle) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function ensurePermission(handle: FileSystemFileHandle): Promise<boolean> {
  const opts = { mode: "readwrite" as const };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  return (await handle.requestPermission(opts)) === "granted";
}

// 建立一份新的本機對照表檔案（存檔對話框），並記住這次選擇供之後的瀏覽器工作階段重用。
// 必須在使用者手勢（click）觸發的處理函式內直接呼叫，不能包在多層 await 之後。
export async function pickMappingFile(): Promise<FileSystemFileHandle> {
  const handle = await window.showSaveFilePicker({
    suggestedName: "病歷號對照表.csv",
    types: [{ description: "CSV", accept: { "text/csv": [".csv"] } }],
  });
  await saveHandle(handle);
  return handle;
}

// 直接選一份「已經存在」的對照表 CSV（開檔對話框）。
// 跟 pickMappingFile 的差別只在對話框種類：存檔對話框選既有檔案時瀏覽器會問「要不要取代」，
// 對「我已經有一份對照表、只想掛上去」的情境很嚇人。開檔對話框拿到的 handle 預設只有唯讀權限，
// 因此這裡立刻要求 readwrite（之後新增個案要把新的對應附加寫回同一個檔案）。
export async function openExistingMappingFile(): Promise<FileSystemFileHandle> {
  const [handle] = await window.showOpenFilePicker({
    multiple: false,
    types: [{ description: "CSV", accept: { "text/csv": [".csv"] } }],
  });
  if (!handle) throw new Error("沒有選到檔案");
  const granted = await ensurePermission(handle);
  if (!granted) throw new Error("需要讀寫權限才能維護對照表（新增個案時要寫回同一個檔案）");
  await saveHandle(handle);
  return handle;
}

// 取得目前已設定的檔案 handle（不會跳出選擇視窗、不會要求權限）；若尚未設定過，回傳 null。
// 權限確認要放在使用者手勢（如送出表單）觸發的當下呼叫 requestHandlePermission，
// 否則瀏覽器會因為不是使用者主動操作而拒絕彈出授權提示。
export async function getConfiguredHandle(): Promise<FileSystemFileHandle | null> {
  return loadHandle();
}

export async function requestHandlePermission(handle: FileSystemFileHandle): Promise<boolean> {
  return ensurePermission(handle);
}

function parseCsvLine(line: string): string[] {
  return line.split(",").map((cell) => cell.replace(/^"|"$/g, "").replace(/""/g, '"'));
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export interface MrnMappingRow {
  mrn: string;
  research_id: string;
  case_id: string;
  created_at: string;
  /** 病人姓名。跟病歷號一樣只存在這個本機檔案，不會送到伺服器。舊格式的檔案沒有這欄，讀出來是空字串。 */
  name: string;
}

export async function readAllRows(handle: FileSystemFileHandle): Promise<MrnMappingRow[]> {
  const file = await handle.getFile();
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];
  return lines.slice(1).map((line) => {
    const [mrn, research_id, case_id, created_at, name] = parseCsvLine(line);
    return { mrn, research_id, case_id, created_at, name: name ?? "" };
  });
}

// 新增一筆病歷號-研究編號對應，附加到本機檔案末端（保留既有內容）。
export async function appendMappingRow(handle: FileSystemFileHandle, row: MrnMappingRow): Promise<void> {
  const file = await handle.getFile();
  const existingText = await file.text();
  const hasHeader = existingText.trim().length > 0;
  const line = [row.mrn, row.research_id, row.case_id, row.created_at, row.name ?? ""].map(csvField).join(",");
  const newText = hasHeader ? `${existingText.replace(/\s*$/, "")}\n${line}\n` : `${CSV_HEADER}\n${line}\n`;
  const writable = await handle.createWritable();
  await writable.write(newText);
  await writable.close();
}
