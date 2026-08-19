// 「蟹足腫初次發生時間」的精度轉換。
//
// 助理 D6（2026-08-13／08-14 確認）：初診時問初次發生時間，**大約記到年份即可**，
// 後續分析再換算成月數。原本輸入端是 `<input type="date">`，非得選到某一天，
// 病人多半記不得，只好亂填一天。2026-08-14 改為 `<input type="month">`（只選年月）。
//
// 資料庫 `cases.keloid_onset_date` 仍是 date 欄位（不動 schema，也不新增精度旗標）：
// 存進去時一律補成當月 1 日。匯出的 `time of occurrence` 是「相差幾個月」，
// 日不影響月差的整數結果，所以補 1 日不會讓數字失真。

/** `<input type="month">` 送出的 `YYYY-MM`（或舊資料的 `YYYY-MM-DD`）→ 可寫入 date 欄位的 `YYYY-MM-01`。 */
export function onsetMonthToDate(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-01` : null;
}

/** 資料庫的 `YYYY-MM-DD` → `<input type="month">` 的 defaultValue `YYYY-MM`。 */
export function onsetDateToMonth(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : "";
}
