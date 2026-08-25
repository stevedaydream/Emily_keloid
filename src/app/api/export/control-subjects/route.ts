import ExcelJS from "exceljs";
import { supabaseServer } from "@/lib/supabase";

// 對照組（健康受試者）匯出 —— **獨立一個檔**（助理 2026-08-24 裁決）。
//
// 原本對照組是主檔裡的一張分頁（決策 2026-08-20 F-F3），助理 08-24 改為「對照組和實驗組
// 分成兩個檔」。分檔而不是分頁的實際差別：主檔是要交出去跑統計的那一份，
// 對照組的欄位定義（沒有病灶、沒有手術、沒有追蹤）跟它完全不同，
// 混在同一個活頁簿裡每次都要先手動刪一張分頁。
//
// 這裡不重用 structured-data 那支：對照組只有六個欄位加上 Lab 數值，
// 抄一份 200 行的主表產生器只會讓兩邊各自漂移。
//
// 篩選：同意書規則與主檔一致（預設只匯出已簽署的，`?consent=all` 才全帶），
// 兩個下載按鈕共用同一組查詢字串，不會一個檔篩過、另一個沒篩。

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = supabaseServer();
  const includeUnconsented = new URL(request.url).searchParams.get("consent") === "all";

  const [{ data: subjects }, { data: labMarkers }, { data: labResults }] = await Promise.all([
    supabase.from("control_subjects").select("*").eq("active", true).order("subject_code"),
    supabase.from("lab_marker_definitions").select("id, display_name, unit, sort_order").order("sort_order"),
    supabase
      .from("lab_results")
      .select("control_subject_id, marker_id, value, value_text, sample_date, note, recorded_by")
      .not("control_subject_id", "is", null),
  ]);

  const markers = labMarkers ?? [];
  // Lab 數值與實驗組共用同一張 lab_results（決策 F-F5），跑組間比較時單位與標記定義才會一致。
  const bySubject = new Map<string, Map<string, string | number>>();
  for (const r of labResults ?? []) {
    if (!r.control_subject_id) continue;
    const row = bySubject.get(r.control_subject_id) ?? new Map<string, string | number>();
    row.set(r.marker_id, r.value ?? r.value_text ?? "");
    bySubject.set(r.control_subject_id, row);
  }

  const rows = (subjects ?? []).filter((cs) => includeUnconsented || Boolean(cs.consent_signed_at));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Keloid Research Platform";

  const ws = wb.addWorksheet("對照組");
  ws.addRow([
    "Subject_ID", "gender", "Age", "同意書簽署日", "抽血日期", "備註",
    ...markers.map((m) => (m.unit ? `${m.display_name}（${m.unit}）` : m.display_name)),
  ]);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const cs of rows) {
    const values = bySubject.get(cs.id);
    ws.addRow([
      cs.subject_code ?? "",
      cs.sex === "male" ? 1 : cs.sex === "female" ? 2 : "",
      cs.age_at_enrollment ?? "",
      cs.consent_signed_at ?? "",
      cs.blood_draw_date ?? "",
      cs.notes ?? "",
      ...markers.map((m) => values?.get(m.id) ?? ""),
    ]);
  }
  ws.columns.forEach((c) => (c.width = 18));

  // Lab 逐筆：同一位受試者同一標記可能有多次紀錄，上面那張寬表一格只放得下一個值。
  const detail = wb.addWorksheet("Lab 生物標記逐筆");
  detail.addRow(["Subject_ID", "標記", "單位", "採檢日期", "數值", "原始字串", "備註", "記錄者"]);
  detail.getRow(1).font = { bold: true };
  detail.views = [{ state: "frozen", ySplit: 1 }];
  const codeById = new Map(rows.map((cs) => [cs.id, cs.subject_code as string]));
  const markerById = new Map(markers.map((m) => [m.id, m]));
  for (const r of labResults ?? []) {
    if (!r.control_subject_id || !codeById.has(r.control_subject_id)) continue;
    detail.addRow([
      codeById.get(r.control_subject_id) ?? "",
      markerById.get(r.marker_id)?.display_name ?? "",
      markerById.get(r.marker_id)?.unit ?? "",
      r.sample_date ?? "",
      r.value ?? "",
      r.value_text ?? "",
      r.note ?? "",
      r.recorded_by ?? "",
    ]);
  }
  detail.columns.forEach((c) => (c.width = 16));

  // 說明分頁：拿到檔案的人不見得記得對照組為什麼只有這幾欄。
  const note = wb.addWorksheet("說明");
  for (const line of [
    ["對照組（健康受試者）匯出檔"],
    [`匯出日期：${new Date().toISOString().slice(0, 10)}`],
    [`同意書篩選：${includeUnconsented ? "含未簽署同意書者" : "只含已簽署同意書者（預設）"}`],
    [""],
    ["對照組是健康受試者，沒有病灶、沒有手術、沒有追蹤、沒有 SF-36／PSQI，"],
    ["所以不在實驗組的 Basic Info. 那 200 多欄裡（決策 2026-08-20 F-F1/F-F2）。"],
    ["對照組只抽一次血，Lab 數值與實驗組存在同一張表，可直接跑組間比較（F-F5）。"],
    ["實驗組資料請下載另一個檔（/export 頁的「① 結構化資料表」）。"],
  ]) {
    note.addRow(line);
  }
  note.getColumn(1).width = 80;

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="keloid-control-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
