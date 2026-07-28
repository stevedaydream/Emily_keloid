// 上傳檔案（CSV / Excel）→ { headers, rows } 的解析工具，僅供伺服器端使用（Route Handler）。
import ExcelJS from "exceljs";

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_COLUMNS = 200;

export type ParsedTable = {
  headers: string[];
  rows: Record<string, string>[];
  /** Excel 檔的所有工作表名稱（CSV 為空陣列），供介面提示實際讀了哪一張 */
  sheetNames: string[];
  usedSheet: string | null;
};

/** CSV 逐字元解析，支援雙引號包住的逗號/換行與 "" 跳脫。 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  // 去掉 BOM，統一換行
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return v.result === null || v.result === undefined ? "" : String(v.result);
    if ("richText" in v && Array.isArray(v.richText)) {
      return (v.richText as { text: string }[]).map((r) => r.text).join("");
    }
    if ("hyperlink" in v && typeof v.hyperlink === "string") return v.hyperlink;
    return "";
  }
  return String(value);
}

/** 把二維陣列（含表頭列）整理成 headers + rows，並處理重複/空白欄名。 */
function toTable(grid: string[][], headerRowNo: number): { headers: string[]; rows: Record<string, string>[] } {
  const headerIdx = Math.max(0, headerRowNo - 1);
  const rawHeaders = (grid[headerIdx] ?? []).slice(0, MAX_IMPORT_COLUMNS);

  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h, i) => {
    const base = h.trim() || `（未命名欄位 ${i + 1}）`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });

  const rows: Record<string, string>[] = [];
  for (let r = headerIdx + 1; r < grid.length && rows.length < MAX_IMPORT_ROWS; r++) {
    const line = grid[r] ?? [];
    if (line.every((c) => !c || !c.trim())) continue; // 跳過全空白列
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (line[i] ?? "").trim();
    });
    rows.push(obj);
  }
  return { headers, rows };
}

export async function parseUploadedTable(
  file: File,
  opts: { headerRowNo?: number; sheetName?: string } = {}
): Promise<ParsedTable> {
  const headerRowNo = opts.headerRowNo && opts.headerRowNo > 0 ? opts.headerRowNo : 1;
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const text = new TextDecoder("utf-8").decode(await file.arrayBuffer());
    const { headers, rows } = toTable(parseCsv(text), headerRowNo);
    return { headers, rows, sheetNames: [], usedSheet: null };
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheetNames = workbook.worksheets.map((ws) => ws.name);
    const sheet = opts.sheetName
      ? workbook.worksheets.find((ws) => ws.name === opts.sheetName)
      : workbook.worksheets[0];
    if (!sheet) {
      throw new Error(`找不到工作表「${opts.sheetName}」。此檔案的工作表有：${sheetNames.join("、")}`);
    }

    const grid: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const values = row.values as ExcelJS.CellValue[]; // index 0 為空，欄位從 1 開始
      const line: string[] = [];
      for (let c = 1; c <= Math.min(MAX_IMPORT_COLUMNS, values.length - 1); c++) {
        line.push(cellToString(values[c]));
      }
      grid.push(line);
    });

    const { headers, rows } = toTable(grid, headerRowNo);
    return { headers, rows, sheetNames, usedSheet: sheet.name };
  }

  throw new Error("僅支援 .csv / .xlsx / .xlsm 檔案（.xls 舊格式請先另存為 .xlsx）");
}
