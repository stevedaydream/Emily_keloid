"use client";

// 病歷號 <-> 研究編號對照表：全程只在瀏覽器本機執行，透過 File System Access API
// 直接讀寫使用者選定的本機 CSV 檔案，這段程式碼「不會」對任何伺服器（含本平台的 Vercel/Supabase）
// 發出任何網路請求，病歷號因此完全不會離開這台電腦。
//
// ⚠️ 支援度：桌機版 Chrome / Edge 一直有；**Android Chrome 現在也有**（2026-08-20 平板實測，
// 檔案會落在裝置的「下載」資料夾）。iPad Safari 仍然沒有，那台只能走雲端保管庫。
//
// 2026-08-20 決策（使用者指定）：**平板要能讀寫對照表，不排除行動裝置**。
// 代價是病歷號與姓名會落在平板上，而平板也是交給病人自填的那一台（pending.md C1b：
// Phase 0 沒有裝置隔離）。使用者在被提醒後仍要求保留，正式收案前應搭配裝置管理措施
// （螢幕鎖、不外借、離開診間收好），Phase 1 送 IRB 時要一併說明。

const DB_NAME = "keloid-local-tools";
const STORE_NAME = "handles";
const HANDLE_KEY = "mrn-mapping-file";
// 第 5 欄 name 是 2026-07-28 才加的（決策：姓名跟病歷號一樣只留本機，雲端永遠不存）。
// 舊檔案只有 4 欄也讀得動，name 會是空字串。
const CSV_HEADER = "mrn,research_id,case_id,created_at,name";

/**
 * 行動裝置判斷。**不是**用來擋掉 File System Access（使用者要求平板照樣能讀寫），
 * 只用來決定檔案選擇器要不要帶 `types`——見 openExistingMappingFile 的說明。
 */
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData?.mobile) return true;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPod|iPad/i.test(ua)) return true;
  // iPadOS 13+ 的 Safari 把自己報成 Macintosh，只剩觸控點數分得出來
  return /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
}

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
  // 有些行動裝置的實作沒有 queryPermission／requestPermission（權限持久化機制）。
  // 少了這兩支不代表沒權限——剛從選擇器拿到的 handle 本來就是可讀寫的，直接放行，
  // 真的不能寫時 createWritable() 會自己丟錯，錯誤訊息也比「權限被拒絕」精確。
  if (typeof handle.queryPermission !== "function" || typeof handle.requestPermission !== "function") return true;
  if ((await handle.queryPermission(opts)) === "granted") return true;

  // requestPermission 規定要在使用者手勢裡呼叫。頁面一載入就自動重讀對照表時沒有手勢，
  // Android Chrome 會直接丟 "Failed to execute 'requestPermission' on 'FileSystemHandle':
  // User activation is required to request permissions."（實機證實：那台手機是有這兩支 API 的，
  // 原本註解假設行動裝置沒有，錯了）。
  // 這種情況**不是「被拒絕」**，是「現在還不能問」——回 false 讓呼叫端顯示一個可以按的重試，
  // 別把瀏覽器的英文例外原樣丟到護理師眼前。
  if (typeof navigator !== "undefined" && navigator.userActivation && !navigator.userActivation.isActive) {
    return false;
  }
  try {
    return (await handle.requestPermission(opts)) === "granted";
  } catch {
    return false;
  }
}

// 建立一份新的本機對照表檔案（存檔對話框），並記住這次選擇供之後的瀏覽器工作階段重用。
// 必須在使用者手勢（click）觸發的處理函式內直接呼叫，不能包在多層 await 之後。
export async function pickMappingFile(): Promise<FileSystemFileHandle> {
  // 行動裝置同樣不帶 types：存檔時帶進去的 MIME 會被系統記在該檔案上，
  // 之後用開檔選擇器找它時反而更容易對不上而變灰。
  const handle = await window.showSaveFilePicker({
    suggestedName: "病歷號對照表.csv",
    ...(isMobileDevice() ? {} : { types: [{ description: "CSV", accept: { "text/csv": [".csv"] } }] }),
  });
  await saveHandle(handle);
  return handle;
}

// 直接選一份「已經存在」的對照表 CSV（開檔對話框）。
// 跟 pickMappingFile 的差別只在對話框種類：存檔對話框選既有檔案時瀏覽器會問「要不要取代」，
// 對「我已經有一份對照表、只想掛上去」的情境很嚇人。開檔對話框拿到的 handle 預設只有唯讀權限，
// 因此這裡立刻要求 readwrite（之後新增個案要把新的對應附加寫回同一個檔案）。
export async function openExistingMappingFile(): Promise<FileSystemFileHandle> {
  // ⚠️ 行動裝置不能帶 types（2026-08-20 平板實測的反灰主因）。
  // Android 的檔案選擇器是依**系統認定的 MIME** 過濾、不看副檔名：同樣一個 .csv，
  // 來源不同會被標成 text/comma-separated-values、application/vnd.ms-excel、
  // application/octet-stream……帶了 accept 就整批變灰點不到，連自己剛建的那份也選不了。
  // 桌機的選擇器是看副檔名，留著 types 才不會滿畫面都是無關檔案。
  // （同一個坑 mrn-mapping 頁的 <input type="file"> 已經踩過，那裡的解法也是不設 accept。）
  const [handle] = await window.showOpenFilePicker({
    multiple: false,
    ...(isMobileDevice() ? {} : { types: [{ description: "CSV", accept: { "text/csv": [".csv"] } }] }),
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

function parseRows(text: string): MrnMappingRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];
  return lines.slice(1).map((line) => {
    const [mrn, research_id, case_id, created_at, name] = parseCsvLine(line);
    return { mrn, research_id, case_id, created_at, name: name ?? "" };
  });
}

export async function readAllRows(handle: FileSystemFileHandle): Promise<MrnMappingRow[]> {
  const file = await handle.getFile();
  return parseRows(await file.text());
}

/**
 * 開發用逃生口：直接從 <input type="file"> 拿到的 File 讀出對照表。
 *
 * 跟 readAllRows 的差別是**沒有 handle**——因此讀完就結束，無法寫回、也無法在下次
 * 開啟頁面時自動重讀。呼叫端只能把結果放在記憶體（見 LocalNameProvider 的 mountFromFile），
 * **絕對不要寫進 IndexedDB／localStorage**：行動裝置是要交到病人手上的那一台，
 * 病歷號與姓名不該在上面落地（見 pending.md C1b）。
 */
export async function readRowsFromFile(file: File): Promise<MrnMappingRow[]> {
  return parseRows(await file.text());
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

/**
 * 這個病歷號收過案了嗎（2026-08-20）。
 *
 * 病歷號永遠不會離開這台裝置（決策 #1），所以伺服器**無法**檢查重複——
 * 但送出的當下瀏覽器手上剛好就有整份對照表，檢查只能、也只需要在這裡做。
 *
 * 比對前正規化：去頭尾空白、忽略大小寫。醫院病歷號常有前置 0，所以**不**去掉前置 0——
 * `0012345` 與 `12345` 在院內是不同的號，硬要當成同一個反而會擋掉正確的收案。
 */
export function findByMrn(rows: MrnMappingRow[], mrn: string): MrnMappingRow[] {
  const needle = mrn.trim().toLowerCase();
  if (!needle) return [];
  return rows.filter((r) => (r.mrn ?? "").trim().toLowerCase() === needle);
}
