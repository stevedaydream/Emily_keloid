"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { generateResearchId } from "@/lib/researchId";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";

export async function commitImportRowAction(formData: FormData) {
  const rowId = formData.get("row_id") as string;
  const batchId = formData.get("batch_id") as string;
  const doctorId = formData.get("doctor_id") as string;
  const bodySite = (formData.get("body_site") as string) || null;
  const consentSignedAt = (formData.get("consent_signed_at") as string) || null;
  const enrollmentYear = Number(formData.get("enrollment_year"));
  const operator = (await getCurrentOperator()) ?? "未知操作者";

  const supabase = supabaseServer();
  const { data: doctor } = await supabase.from("doctors").select("code").eq("id", doctorId).single();
  if (!doctor) throw new Error("找不到醫師代碼");

  const { researchId, sequenceNo } = await generateResearchId(supabase, doctorId, doctor.code, enrollmentYear);

  const { data: newCase, error } = await supabase
    .from("cases")
    .insert({
      research_id: researchId,
      doctor_id: doctorId,
      enrollment_year: enrollmentYear,
      sequence_no: sequenceNo,
      body_site: bodySite,
      consent_signed_at: consentSignedAt,
      consent_confirmed_by: consentSignedAt ? operator : null,
      data_source: "legacy_import",
      created_by: operator,
      notes: "舊資料回溯建檔",
    })
    .select("id")
    .single();
  if (error || !newCase) throw error ?? new Error("建立個案失敗");

  await supabase.from("case_data_completeness").insert([
    { case_id: newCase.id, field_key: "icd_diagnosis", field_label: "ICD-9/10 診斷碼", status: "pending", note: "舊資料匯入，尚未確認" },
    { case_id: newCase.id, field_key: "term_pre_op", field_label: "術前術語紀錄", status: "pending", note: "舊資料匯入，尚未確認" },
    { case_id: newCase.id, field_key: "term_post_op", field_label: "術後術語紀錄", status: "pending", note: "舊資料匯入，尚未確認" },
  ]);

  await supabase
    .from("legacy_import_rows")
    .update({ status: "committed", research_id: researchId, committed_case_id: newCase.id })
    .eq("id", rowId);

  await logAudit({ caseId: newCase.id, operatorName: operator, action: "commit_legacy_import_row", entity: "legacy_import_rows", entityId: rowId, detail: { researchId, batchId } });

  revalidatePath("/admin/import");
}

export async function rejectImportRowAction(formData: FormData) {
  const rowId = formData.get("row_id") as string;
  const supabase = supabaseServer();
  await supabase.from("legacy_import_rows").update({ status: "rejected" }).eq("id", rowId);
  revalidatePath("/admin/import");
}
