"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase";
import { generateResearchId } from "@/lib/researchId";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";
import { mapAndValidateRow, parseResearchId, IMPORT_TARGET_FIELDS } from "@/lib/importFields";

type ImportRow = {
  id: string;
  batch_id: string;
  raw_data: Record<string, unknown>;
  mapped_data: Record<string, string | number | null>;
  validation_errors: string[];
  status: string;
};

async function activeDoctorCodes(supabase: SupabaseClient) {
  const { data } = await supabase.from("doctors").select("code").eq("active", true);
  return (data ?? []).map((d: { code: string }) => d.code.toUpperCase());
}

/** 依目前的欄位對應，重新計算整批 pending 列的 mapped_data 與驗證錯誤。 */
async function revalidateBatchRows(supabase: SupabaseClient, batchId: string, mapping: Record<string, string>) {
  const [{ data: rows }, doctorCodes] = await Promise.all([
    supabase.from("legacy_import_rows").select("id, raw_data").eq("batch_id", batchId).eq("status", "pending"),
    activeDoctorCodes(supabase),
  ]);

  for (const row of (rows ?? []) as { id: string; raw_data: Record<string, unknown> }[]) {
    const { mapped, errors } = mapAndValidateRow(row.raw_data, mapping, doctorCodes);
    await supabase
      .from("legacy_import_rows")
      .update({
        mapped_data: mapped,
        validation_errors: errors,
        research_id: typeof mapped.research_id === "string" ? mapped.research_id : null,
      })
      .eq("id", row.id);
  }
}

/** 從一列已對應好的資料建立個案。回傳研究編號；失敗時丟出錯誤。 */
async function commitRow(supabase: SupabaseClient, row: ImportRow, operator: string) {
  const mapped = row.mapped_data ?? {};
  const providedResearchId = typeof mapped.research_id === "string" ? mapped.research_id.trim() : "";
  const parsed = providedResearchId ? parseResearchId(providedResearchId) : null;

  const doctorCode = String(mapped.doctor_code ?? parsed?.doctorCode ?? "").toUpperCase();
  if (!doctorCode) throw new Error(`第 ${row.id} 列缺少醫師代碼`);

  const { data: doctor } = await supabase.from("doctors").select("id, code").eq("code", doctorCode).maybeSingle();
  if (!doctor) throw new Error(`找不到醫師代碼「${doctorCode}」，請先於後台「醫師代碼清單」新增`);

  const year = Number(mapped.enrollment_year ?? parsed?.year);
  if (!year) throw new Error("缺少收案年份");

  let researchId = providedResearchId;
  let sequenceNo = parsed?.sequenceNo ?? 0;
  if (researchId) {
    const { data: dup } = await supabase.from("cases").select("id").eq("research_id", researchId).maybeSingle();
    if (dup) throw new Error(`研究編號「${researchId}」已存在，請先確認是否重複匯入`);
  } else {
    const generated = await generateResearchId(supabase, doctor.id, doctor.code, year);
    researchId = generated.researchId;
    sequenceNo = generated.sequenceNo;
  }

  // 只寫 cases 實際存在的欄位（research_id/doctor_code 是對應用的中介值，不直接寫入）
  const caseFields: Record<string, unknown> = {};
  for (const field of IMPORT_TARGET_FIELDS) {
    if (["research_id", "doctor_code", "enrollment_year"].includes(field.key)) continue;
    const value = mapped[field.key];
    if (value !== undefined && value !== null && value !== "") caseFields[field.key] = value;
  }

  const consentSignedAt = caseFields.consent_signed_at as string | undefined;

  const { data: newCase, error } = await supabase
    .from("cases")
    .insert({
      ...caseFields,
      research_id: researchId,
      doctor_id: doctor.id,
      enrollment_year: year,
      sequence_no: sequenceNo,
      consent_confirmed_by: consentSignedAt ? operator : null,
      data_source: "legacy_import",
      created_by: operator,
      notes: (caseFields.notes as string) ?? "舊資料回溯建檔",
    })
    .select("id")
    .single();
  if (error || !newCase) throw error ?? new Error("建立個案失敗");

  // 資料完整度清單：系統上線前不存在的概念標為不適用，其餘舊表沒帶到的欄位標為待補
  await supabase.from("case_data_completeness").insert([
    { case_id: newCase.id, field_key: "icd_diagnosis", field_label: "ICD-9/10 診斷碼", status: "not_applicable", note: "系統上線前無此紀錄" },
    { case_id: newCase.id, field_key: "term_pre_op", field_label: "術前術語紀錄", status: "not_applicable", note: "系統上線前無此紀錄" },
    { case_id: newCase.id, field_key: "term_post_op", field_label: "術後術語紀錄", status: "not_applicable", note: "系統上線前無此紀錄" },
    ...(caseFields.sex ? [] : [{ case_id: newCase.id, field_key: "sex", field_label: "性別", status: "pending", note: "舊資料缺值" }]),
    ...(caseFields.age_at_enrollment
      ? []
      : [{ case_id: newCase.id, field_key: "age_at_enrollment", field_label: "收案年齡", status: "pending", note: "舊資料缺值" }]),
    ...(consentSignedAt
      ? []
      : [{ case_id: newCase.id, field_key: "consent_signed_at", field_label: "同意書簽署日期", status: "pending", note: "舊資料缺值" }]),
  ]);

  await supabase
    .from("legacy_import_rows")
    .update({ status: "committed", research_id: researchId, committed_case_id: newCase.id })
    .eq("id", row.id);

  await logAudit({
    caseId: newCase.id,
    operatorName: operator,
    action: "commit_legacy_import_row",
    entity: "legacy_import_rows",
    entityId: row.id,
    detail: { researchId, batchId: row.batch_id },
  });

  return researchId;
}

async function syncBatchCounters(supabase: SupabaseClient, batchId: string) {
  const [{ count: total }, { count: committed }, { count: pending }] = await Promise.all([
    supabase.from("legacy_import_rows").select("id", { count: "exact", head: true }).eq("batch_id", batchId),
    supabase.from("legacy_import_rows").select("id", { count: "exact", head: true }).eq("batch_id", batchId).eq("status", "committed"),
    supabase.from("legacy_import_rows").select("id", { count: "exact", head: true }).eq("batch_id", batchId).eq("status", "pending"),
  ]);
  await supabase
    .from("legacy_import_batches")
    .update({
      total_rows: total ?? 0,
      committed_rows: committed ?? 0,
      status: (pending ?? 0) === 0 ? "committed" : "reviewed",
    })
    .eq("id", batchId);
}

/** 儲存欄位對應並重新驗證整批資料。表單欄位名稱格式：map__<來源欄位名稱>。 */
export async function saveColumnMappingAction(formData: FormData) {
  const batchId = formData.get("batch_id") as string;
  if (!batchId) return;

  const mapping: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("map__")) continue;
    const target = String(value);
    if (target) mapping[key.slice(5)] = target;
  }

  const supabase = supabaseServer();
  await supabase.from("legacy_import_batches").update({ column_mapping: mapping, status: "reviewed" }).eq("id", batchId);
  await revalidateBatchRows(supabase, batchId, mapping);

  revalidatePath(`/admin/import/${batchId}`);
}

export async function saveMappingTemplateAction(formData: FormData) {
  const batchId = formData.get("batch_id") as string;
  const name = (formData.get("template_name") as string)?.trim();
  if (!batchId || !name) return;

  const supabase = supabaseServer();
  const operator = (await getCurrentOperator()) ?? "未知操作者";
  const { data: batch } = await supabase.from("legacy_import_batches").select("column_mapping").eq("id", batchId).single();
  if (!batch) return;

  await supabase
    .from("import_mapping_templates")
    .upsert({ name, mapping: batch.column_mapping, created_by: operator }, { onConflict: "name" });

  revalidatePath(`/admin/import/${batchId}`);
}

export async function applyMappingTemplateAction(formData: FormData) {
  const batchId = formData.get("batch_id") as string;
  const templateId = formData.get("template_id") as string;
  if (!batchId || !templateId) return;

  const supabase = supabaseServer();
  const { data: template } = await supabase.from("import_mapping_templates").select("mapping").eq("id", templateId).single();
  if (!template) return;

  // 範本可能來自欄位不完全相同的檔案，只套用這次檔案裡真的存在的來源欄位
  const { data: firstRow } = await supabase
    .from("legacy_import_rows")
    .select("raw_data")
    .eq("batch_id", batchId)
    .order("row_number")
    .limit(1)
    .maybeSingle();
  const headers = Object.keys((firstRow?.raw_data as Record<string, unknown>) ?? {});
  const mapping: Record<string, string> = {};
  for (const [source, target] of Object.entries((template.mapping ?? {}) as Record<string, string>)) {
    if (headers.includes(source) && target) mapping[source] = target;
  }

  await supabase.from("legacy_import_batches").update({ column_mapping: mapping, status: "reviewed" }).eq("id", batchId);
  await revalidateBatchRows(supabase, batchId, mapping);

  revalidatePath(`/admin/import/${batchId}`);
}

export async function commitImportRowAction(formData: FormData) {
  const rowId = formData.get("row_id") as string;
  const supabase = supabaseServer();
  const operator = (await getCurrentOperator()) ?? "未知操作者";

  const { data: row } = await supabase
    .from("legacy_import_rows")
    .select("id, batch_id, raw_data, mapped_data, validation_errors, status")
    .eq("id", rowId)
    .single();
  if (!row || row.status !== "pending") return;

  // 單列匯入失敗時不要讓錯誤往外丟——Next 在正式環境會把 throw 的訊息換成一段英文，
  // 使用者只會看到「發生錯誤」。改成跟「整批匯入」同一個做法：把原因寫回該列的驗證錯誤，
  // 直接顯示在畫面上那一列旁邊。
  try {
    await commitRow(supabase, row as ImportRow, operator);
  } catch (e) {
    const message = e instanceof Error ? e.message : "匯入失敗";
    await supabase
      .from("legacy_import_rows")
      .update({ validation_errors: [...((row.validation_errors as string[]) ?? []), message] })
      .eq("id", row.id);
  }
  await syncBatchCounters(supabase, row.batch_id);

  revalidatePath(`/admin/import/${row.batch_id}`);
}

/** 一次匯入整批「沒有驗證錯誤」的待處理列；有錯誤的列略過不動。 */
export async function commitAllValidRowsAction(formData: FormData) {
  const batchId = formData.get("batch_id") as string;
  if (!batchId) return;

  const supabase = supabaseServer();
  const operator = (await getCurrentOperator()) ?? "未知操作者";
  const { data: rows } = await supabase
    .from("legacy_import_rows")
    .select("id, batch_id, raw_data, mapped_data, validation_errors, status")
    .eq("batch_id", batchId)
    .eq("status", "pending")
    .order("row_number");

  for (const row of (rows ?? []) as ImportRow[]) {
    if ((row.validation_errors ?? []).length > 0) continue;
    try {
      await commitRow(supabase, row, operator);
    } catch (e) {
      // 單列失敗不中斷整批：把錯誤寫回該列，讓使用者在畫面上看到原因
      const message = e instanceof Error ? e.message : "匯入失敗";
      await supabase
        .from("legacy_import_rows")
        .update({ validation_errors: [...(row.validation_errors ?? []), message] })
        .eq("id", row.id);
    }
  }

  await syncBatchCounters(supabase, batchId);
  revalidatePath(`/admin/import/${batchId}`);
}

export async function rejectImportRowAction(formData: FormData) {
  const rowId = formData.get("row_id") as string;
  const supabase = supabaseServer();
  const { data: row } = await supabase.from("legacy_import_rows").select("batch_id").eq("id", rowId).single();
  await supabase.from("legacy_import_rows").update({ status: "rejected" }).eq("id", rowId);
  if (row) {
    await syncBatchCounters(supabase, row.batch_id);
    revalidatePath(`/admin/import/${row.batch_id}`);
  }
}

/** 刪除整個暫存批次（不會刪掉已經建立的個案）。 */
export async function deleteBatchAction(formData: FormData) {
  const batchId = formData.get("batch_id") as string;
  if (!batchId) return;

  const supabase = supabaseServer();
  const operator = (await getCurrentOperator()) ?? "未知操作者";
  // committed_case_id 是 NO ACTION 外鍵，會擋住批次刪除，先解除關聯（個案本身保留）
  await supabase.from("legacy_import_rows").update({ committed_case_id: null }).eq("batch_id", batchId);
  await supabase.from("legacy_import_batches").delete().eq("id", batchId);

  await logAudit({ operatorName: operator, action: "delete_legacy_import_batch", entity: "legacy_import_batches", entityId: batchId });

  revalidatePath("/admin/import");
  redirect("/admin/import");
}
