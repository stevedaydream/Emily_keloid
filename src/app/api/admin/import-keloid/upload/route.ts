import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";
import { MAIN_SHEETS } from "@/lib/exportCodebook";
import { OTHER_ZONE_KEY } from "@/lib/bodyZones";
import { mergeSheetsBySubject, decodeCase, type SheetRow, type ImportLookups } from "@/lib/keloidFormatImport";

// 部長 2026-08 版格式的專用匯入（與 /api/export/import-template 的空白範本對稱）。
//
// 走 Route Handler 而非 Server Action：Server Action 的請求本體預設上限只有 1MB。
//
// 去識別化把關（決策 #1／#13）：範本的 Name 與 Chart No. 兩欄必須是空的。
// 上傳頁會在瀏覽器端先把這兩欄拆下來寫進本機對照表再送出；這裡是第二道防線——
// 只要偵測到有值就整份擋掉、不寫入任何資料，避免病歷號明文進雲端。

export const dynamic = "force-dynamic";

const MAX_CASES = 2000;

/** 讀一張工作表：第 1 列是編碼說明、第 2 列是欄名、第 3 列起是資料。 */
function readSheet(ws: ExcelJS.Worksheet | undefined): { headers: string[]; rows: SheetRow[] } {
  if (!ws) return { headers: [], rows: [] };
  const headers = (ws.getRow(2).values as unknown[]).map((v) => String(v ?? "").trim());
  const rows: SheetRow[] = [];
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj: SheetRow = {};
    let any = false;
    for (let c = 1; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      let v = row.getCell(c).value;
      // exceljs 的公式儲存格是物件，取結果值
      if (v && typeof v === "object" && "result" in v) v = (v as { result: unknown }).result as never;
      if (v !== null && v !== undefined && String(v).trim() !== "") any = true;
      obj[key] = v;
    }
    if (any) rows.push(obj);
  }
  return { headers, rows };
}

function findPii(sheets: { name: string; rows: SheetRow[] }[]): string[] {
  const hits: string[] = [];
  for (const s of sheets) {
    for (const col of ["Name", "Chart No."]) {
      const n = s.rows.filter((r) => String(r[col] ?? "").trim() !== "").length;
      if (n > 0) hits.push(`${s.name} 的「${col}」欄有 ${n} 列填了值`);
    }
  }
  return hits;
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "請選擇要上傳的檔案" }, { status: 400 });
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "檔案讀取失敗，請確認是 .xlsx 檔（範本原樣填寫即可）" }, { status: 400 });
  }

  const parsed = MAIN_SHEETS.map((def) => ({ name: def.name, def, ...readSheet(wb.getWorksheet(def.name)) }));
  const missing = parsed.filter((p) => p.headers.length === 0).map((p) => p.name);
  if (missing.length === MAIN_SHEETS.length) {
    return NextResponse.json(
      { error: `找不到任何一張預期的工作表（${MAIN_SHEETS.map((s) => s.name).join("、")}）。請用「下載空白範本」取得正確格式。` },
      { status: 400 }
    );
  }

  // 欄名走樣就擋下來——與其匯進一堆空欄位，不如直接說哪裡不對
  const headerProblems: string[] = [];
  for (const p of parsed) {
    if (p.headers.length === 0) continue;
    const actual = p.headers.filter(Boolean);
    const expected = p.def.headers;
    const missingCols = expected.filter((h) => !actual.includes(h));
    if (missingCols.length) headerProblems.push(`${p.name} 少了欄位：${missingCols.slice(0, 6).join("、")}${missingCols.length > 6 ? ` 等 ${missingCols.length} 欄` : ""}`);
  }
  if (headerProblems.length) {
    return NextResponse.json({ error: `欄位與範本不符：\n${headerProblems.join("\n")}`, headerProblems }, { status: 400 });
  }

  // 去識別化把關
  const pii = findPii(parsed);
  if (pii.length > 0) {
    return NextResponse.json(
      {
        error:
          "檔案含姓名或病歷號，未上傳任何資料。請用本頁的上傳流程（會在你的瀏覽器裡先把這兩欄拆下來寫進本機對照表），或自行清空這兩欄後再試。",
        piiHeaders: pii,
      },
      { status: 400 }
    );
  }

  const merged = mergeSheetsBySubject({
    basic: parsed[0].rows,
    operation: parsed[1].rows,
    year1: parsed[2].rows,
    year2: parsed[3].rows,
  });
  if (merged.size === 0) {
    return NextResponse.json({ error: "檔案裡沒有任何填了 Subject_ID 的資料列" }, { status: 400 });
  }
  if (merged.size > MAX_CASES) {
    return NextResponse.json({ error: `一次最多匯入 ${MAX_CASES} 位病人，這份檔案有 ${merged.size} 位` }, { status: 400 });
  }

  // ---- 查碼表 ----
  const supabase = supabaseServer();
  const [{ data: zones }, { data: doctors }, { data: icds }, { data: options }] = await Promise.all([
    supabase.from("body_part_zones").select("id, zone_key, display_name, export_code").eq("active", true),
    supabase.from("doctors").select("id, code, export_code").eq("active", true),
    supabase.from("icd_codes").select("id, export_code").eq("active", true),
    supabase.from("case_intake_option_lists").select("id, category, export_code").eq("active", true),
  ]);

  const lookups: ImportLookups = {
    // 碼 22 有多個熱區共用（k22_22_other 以及左/右耳後，後兩者 export_code 也是 22），
    // 匯入時一律落到「其他部位」那個。不能只靠排序後餵給 new Map()——重複 key 時
    // Map 保留的是**最後**一筆，方向很容易寫反（實測就踩到，22 解出了「右耳後」）。
    zoneIdByCode: (() => {
      const m = new Map<number, { id: string; display_name: string }>();
      for (const z of zones ?? []) {
        if (z.export_code === null) continue;
        const existing = m.get(z.export_code);
        // 已經放了 k22_22_other 就不要被其他同碼熱區覆蓋
        if (existing && z.zone_key !== OTHER_ZONE_KEY) continue;
        m.set(z.export_code, { id: z.id, display_name: z.display_name });
      }
      return m;
    })(),
    doctorByCode: new Map(
      (doctors ?? []).filter((d) => d.export_code !== null).map((d) => [d.export_code as number, { id: d.id, code: d.code }])
    ),
    doctorIdByLetterCode: new Map((doctors ?? []).map((d) => [d.code.toUpperCase(), d.id])),
    icdIdByCode: new Map((icds ?? []).filter((i) => i.export_code !== null).map((i) => [i.export_code as number, i.id])),
    optionIdByCategoryCode: (() => {
      const m = new Map<string, Map<number, string>>();
      for (const o of options ?? []) {
        if (o.export_code === null) continue;
        const inner = m.get(o.category) ?? new Map<number, string>();
        inner.set(o.export_code, o.id);
        m.set(o.category, inner);
      }
      return m;
    })(),
  };
  const operator = (await getCurrentOperator()) ?? "未知操作者";
  const decoded = [...merged.entries()].map(([researchId, rows]) => decodeCase(researchId, rows, lookups));

  const { data: batch, error: batchError } = await supabase
    .from("legacy_import_batches")
    .insert({
      source_filename: `${file.name}（部長 2026-08 格式）`,
      column_mapping: { format: "keloid-2026-08" },
      imported_by: operator,
      status: "staged",
      total_rows: decoded.length,
      committed_rows: 0,
    })
    .select("id")
    .single();
  if (batchError || !batch) {
    return NextResponse.json({ error: batchError?.message ?? "建立匯入批次失敗" }, { status: 500 });
  }

  const staged = decoded.map((d, i) => ({
    batch_id: batch.id,
    row_number: i + 1,
    raw_data: (merged.get(d.research_id) ?? {}) as Record<string, unknown>,
    mapped_data: d as unknown as Record<string, unknown>,
    research_id: d.research_id,
    validation_errors: [...d.errors, ...d.warnings.map((w) => `⚠ ${w}`)],
    status: "pending",
  }));

  for (let i = 0; i < staged.length; i += 100) {
    const { error } = await supabase.from("legacy_import_rows").insert(staged.slice(i, i + 100));
    if (error) {
      await supabase.from("legacy_import_batches").delete().eq("id", batch.id);
      return NextResponse.json({ error: `寫入暫存資料失敗：${error.message}` }, { status: 500 });
    }
  }

  await logAudit({
    operatorName: operator,
    action: "upload_keloid_format_import",
    entity: "legacy_import_batches",
    entityId: batch.id,
    detail: { filename: file.name, cases: decoded.length },
  });

  return NextResponse.json({
    batchId: batch.id,
    cases: decoded.length,
    blocked: decoded.filter((d) => d.errors.length > 0).length,
    needsReview: decoded.filter((d) => d.errors.length === 0 && d.warnings.length > 0).length,
  });
}
