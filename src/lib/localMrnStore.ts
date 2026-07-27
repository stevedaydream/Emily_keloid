"use client";

// 病歷號 <-> 研究編號對照表：全程只在瀏覽器本機執行，透過 File System Access API
// 直接讀寫使用者選定的本機 CSV 檔案，這段程式碼「不會」對任何伺服器（含本平台的 Vercel/Supabase）
// 發出任何網路請求，病歷號因此完全不會離開這台電腦。僅支援 Chrome / Edge（桌面版）。

const DB_NAME = "keloid-local-tools";
const STORE_NAME = "handles";
const HANDLE_KEY = "mrn-mapping-file";
const CSV_HEADER = "mrn,research_id,case_id,created_at";

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

// 讓使用者選擇（或建立）本機對照表檔案，並記住這次選擇供之後的瀏覽器工作階段重用。
// 必須在使用者手勢（click）觸發的處理函式內直接呼叫，不能包在多層 await 之後。
export async function pickMappingFile(): Promise<FileSystemFileHandle> {
  const handle = await window.showSaveFilePicker({
    suggestedName: "病歷號對照表.csv",
    types: [{ description: "CSV", accept: { "text/csv": [".csv"] } }],
  });
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
}

export async function readAllRows(handle: FileSystemFileHandle): Promise<MrnMappingRow[]> {
  const file = await handle.getFile();
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];
  return lines.slice(1).map((line) => {
    const [mrn, research_id, case_id, created_at] = parseCsvLine(line);
    return { mrn, research_id, case_id, created_at };
  });
}

// 新增一筆病歷號-研究編號對應，附加到本機檔案末端（保留既有內容）。
export async function appendMappingRow(handle: FileSystemFileHandle, row: MrnMappingRow): Promise<void> {
  const file = await handle.getFile();
  const existingText = await file.text();
  const hasHeader = existingText.trim().length > 0;
  const line = [row.mrn, row.research_id, row.case_id, row.created_at].map(csvField).join(",");
  const newText = hasHeader ? `${existingText.replace(/\s*$/, "")}\n${line}\n` : `${CSV_HEADER}\n${line}\n`;
  const writable = await handle.createWritable();
  await writable.write(newText);
  await writable.close();
}
