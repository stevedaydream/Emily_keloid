import ExcelJS from "exceljs";
import { supabaseServer } from "@/lib/supabase";
import { SF36_SCALES } from "@/lib/scoring";
import { MAIN_SHEETS, buildCodebookRows, CODEBOOK_HEADERS } from "@/lib/exportCodebook";

// 匯入用的空白範本：與匯出**完全同一份表頭定義**（MAIN_SHEETS），只是沒有資料列。
//
// 這樣「下載範本 → 助理填 → 上傳匯入」與「匯出」剛好對稱：兩邊共用 src/lib/exportCodebook.ts，
// 不會出現「改了匯出、忘了改範本」導致助理填好的檔案匯不進去。
//
// 附兩張參考表：填寫說明、編碼對照表（後者由資料庫產生，後台改選項會跟著變）。

export const dynamic = "force-dynamic";

const INSTRUCTIONS: string[][] = [
  ["這份範本要怎麼用"],
  [""],
  ["1. 一位病人＝每張工作表各一列，四張表用「Subject_ID」互相對應（一定要填，而且四張表要一致）。"],
  ["2. Subject_ID 請填研究編號（例 YEN-2023-007）。若這位病人還沒有研究編號，請先在系統建檔取得。"],
  ["3. Name 與 Chart No. 兩欄請留空。"],
  ["   姓名與病歷號不會上傳到雲端——上傳前系統會在你的瀏覽器裡把這兩欄拆下來寫進本機對照表。"],
  ["   （若你填了，它們也只會留在這台電腦，不會送出去。）"],
  ["4. 有代碼的欄位請填數字，代碼對照見「編碼對照表」工作表。"],
  ["5. 日期請填 YYYY-MM-DD（例 2023-07-15）。"],
  [""],
  ["關於病灶尺寸（KL size_1 ~ KL size_5）"],
  [""],
  ["直接照病歷原文貼上即可，系統會自動拆成長/寬/高三個數字。以下寫法都認得："],
  ["   3.9 x 3.1 x 1.4 cm      →  長3.9 寬3.1 高1.4"],
  ["   8*3 cm                  →  長8 寬3（高度未記錄）"],
  ["   8.0 x 5.5 x 2.0mm       →  自動換算成公分 0.8 / 0.55 / 0.2"],
  ["   about 4 cm              →  長4（會標記為「只有一個維度」）"],
  ["   4-5cm                   →  取中間值 4.5（會標記為「範圍值，請確認」）"],
  [""],
  ["拆不出來、或看起來像一格塞了多處病灶的（例如「anterior chest 5.6x2.4x1.2 cm / left chest 3.6x1.0x0.8 cm」），"],
  ["系統不會亂猜，會列進匯入預覽的「需人工確認」清單，由你逐筆確認後才寫入。"],
  [""],
  ["重複匯入同一個 Subject_ID"],
  [""],
  ["個案層級的欄位會被新值覆蓋（留空的欄位不覆蓋，不會把既有資料洗掉）；"],
  ["病灶、治療、追蹤這些子資料則以這次上傳的內容整組取代。"],
  ["所以分次補資料時，請把該病人完整的那幾列一起上傳，不要只傳新增的部分。"],
];

export async function GET() {
  const supabase = supabaseServer();
  const [{ data: zones }, { data: options }, { data: doctors }, { data: icdCodes }] = await Promise.all([
    supabase.from("body_part_zones").select("display_name, export_label, export_code, dose_category, active"),
    supabase.from("case_intake_option_lists").select("category, label, export_code, active").order("sort_order"),
    supabase.from("doctors").select("code, name, export_code").order("code"),
    supabase.from("icd_codes").select("code, description_full, export_code").order("code"),
  ]);

  const wb = new ExcelJS.Workbook();

  const guide = wb.addWorksheet("填寫說明");
  for (const line of INSTRUCTIONS) guide.addRow(line);
  guide.getColumn(1).width = 100;
  guide.getRow(1).font = { bold: true, size: 13 };
  [12, 25].forEach((r) => (guide.getRow(r).font = { bold: true }));

  for (const def of MAIN_SHEETS) {
    const ws = wb.addWorksheet(def.name);
    ws.addRow(def.legends.map((l) => l ?? ""));
    ws.addRow(def.headers);
    ws.getRow(1).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
    ws.getRow(2).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 2 }];
    ws.columns.forEach((c) => (c.width = 15));
  }

  const cb = wb.addWorksheet("編碼對照表");
  cb.addRow(CODEBOOK_HEADERS);
  cb.getRow(1).font = { bold: true };
  cb.views = [{ state: "frozen", ySplit: 1 }];
  for (const row of buildCodebookRows({
    zones: zones ?? [],
    options: options ?? [],
    doctors: doctors ?? [],
    icdCodes: icdCodes ?? [],
    sf36Scales: SF36_SCALES,
  })) {
    cb.addRow(row);
  }
  cb.columns.forEach((c) => (c.width = 22));

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="keloid-import-template.xlsx"`,
    },
  });
}
