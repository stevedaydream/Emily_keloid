import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";
import { parseUploadedTable, MAX_IMPORT_ROWS } from "@/lib/importParse";
import { detectPiiHeaders, guessMapping, mapAndValidateRow } from "@/lib/importFields";

// 舊資料檔案上傳。走 Route Handler 而非 Server Action，因為 Server Action 的請求本體
// 預設上限只有 1MB，舊資料 Excel 很容易超過（Vercel Functions 本身可收到 100MB）。
// 存取控制沿用 src/proxy.ts 的共用帳號 session cookie（同源 fetch 會自動帶上）。
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("file");
  const headerRowNo = Number(form.get("header_row") ?? 1) || 1;
  const sheetName = ((form.get("sheet_name") as string) ?? "").trim() || undefined;

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "請選擇要上傳的檔案" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = await parseUploadedTable(file, { headerRowNo, sheetName });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "檔案解析失敗" }, { status: 400 });
  }

  if (parsed.headers.length === 0 || parsed.rows.length === 0) {
    return NextResponse.json(
      { error: `讀不到資料（表頭列設為第 ${headerRowNo} 列${parsed.usedSheet ? `，工作表「${parsed.usedSheet}」` : ""}），請確認表頭列數與工作表名稱` },
      { status: 400 }
    );
  }

  // 去識別化把關（決策 #13）：雲端只接受不含病歷號/姓名的檔案，偵測到就整份擋掉、不寫入任何資料。
  const piiHeaders = detectPiiHeaders(parsed.headers);
  if (piiHeaders.length > 0) {
    return NextResponse.json(
      {
        error: "檔案含疑似個資欄位，未上傳任何資料。請先在本機移除這些欄位（只保留研究編號）再重新上傳。",
        piiHeaders,
      },
      { status: 400 }
    );
  }

  const supabase = supabaseServer();
  const operator = (await getCurrentOperator()) ?? "未知操作者";
  const { data: doctors } = await supabase.from("doctors").select("code").eq("active", true);
  const doctorCodes = (doctors ?? []).map((d) => d.code.toUpperCase());

  const mapping = guessMapping(parsed.headers);

  const { data: batch, error: batchError } = await supabase
    .from("legacy_import_batches")
    .insert({
      source_filename: `${file.name}${parsed.usedSheet ? `（${parsed.usedSheet}）` : ""}`,
      column_mapping: mapping,
      imported_by: operator,
      status: "staged",
      total_rows: parsed.rows.length,
      committed_rows: 0,
    })
    .select("id")
    .single();
  if (batchError || !batch) {
    return NextResponse.json({ error: batchError?.message ?? "建立匯入批次失敗" }, { status: 500 });
  }

  const rows = parsed.rows.map((raw, i) => {
    const { mapped, errors } = mapAndValidateRow(raw, mapping, doctorCodes);
    return {
      batch_id: batch.id,
      row_number: i + 1,
      raw_data: raw,
      mapped_data: mapped,
      research_id: typeof mapped.research_id === "string" ? mapped.research_id : null,
      validation_errors: errors,
      status: "pending",
    };
  });

  // 分批寫入，避免單一 request body 過大
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from("legacy_import_rows").insert(rows.slice(i, i + 200));
    if (error) {
      await supabase.from("legacy_import_batches").delete().eq("id", batch.id);
      return NextResponse.json({ error: `寫入暫存資料失敗：${error.message}` }, { status: 500 });
    }
  }

  await logAudit({
    operatorName: operator,
    action: "upload_legacy_import_file",
    entity: "legacy_import_batches",
    entityId: batch.id,
    detail: { filename: file.name, sheet: parsed.usedSheet, rows: rows.length, columns: parsed.headers.length },
  });

  return NextResponse.json({
    batchId: batch.id,
    rows: rows.length,
    columns: parsed.headers.length,
    sheetNames: parsed.sheetNames,
    usedSheet: parsed.usedSheet,
    truncated: rows.length >= MAX_IMPORT_ROWS,
  });
}
