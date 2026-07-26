"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";

async function operatorOrThrow() {
  const op = await getCurrentOperator();
  if (!op) throw new Error("未選擇操作者");
  return op;
}

export async function addDiagnosisAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const icdCodeId = formData.get("icd_code_id") as string;
  const isPrimary = formData.get("is_primary") === "on";
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase
    .from("case_diagnoses")
    .upsert(
      { case_id: caseId, icd_code_id: icdCodeId, is_primary: isPrimary },
      { onConflict: "case_id,icd_code_id" }
    );

  await logAudit({ caseId, operatorName: operator, action: "add_diagnosis", entity: "case_diagnoses" });
  revalidatePath(`/cases/${caseId}`);
}

export async function addTermRecordAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const stage = formData.get("stage") as string;
  const termIds = formData.getAll("term_ids") as string[];
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  const { data: record, error } = await supabase
    .from("case_term_records")
    .insert({ case_id: caseId, stage, recorded_by: operator })
    .select("id")
    .single();
  if (error || !record) throw error ?? new Error("建立術語紀錄失敗");

  if (termIds.length > 0) {
    await supabase
      .from("case_term_record_items")
      .insert(termIds.map((termId) => ({ record_id: record.id, term_id: termId })));
  }

  await logAudit({ caseId, operatorName: operator, action: "add_term_record", entity: "case_term_records", entityId: record.id, detail: { stage, termIds } });
  revalidatePath(`/cases/${caseId}`);
}

export async function addTreatmentRecordAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const treatmentTypeId = formData.get("treatment_type_id") as string;
  const presetId = (formData.get("preset_id") as string) || null;
  const treatmentDate = formData.get("treatment_date") as string;
  const freeText = (formData.get("free_text") as string) || null;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  // 從動態欄位收集 field_values（欄位名稱以 field__ 前綴傳入）
  const fieldValues: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("field__") && typeof value === "string") {
      fieldValues[key.replace("field__", "")] = value;
    }
  }

  const { data: record, error } = await supabase
    .from("treatment_records")
    .insert({
      case_id: caseId,
      treatment_type_id: treatmentTypeId,
      preset_id: presetId,
      field_values: fieldValues,
      free_text: freeText,
      treatment_date: treatmentDate,
      recorded_by: operator,
    })
    .select("id")
    .single();
  if (error || !record) throw error ?? new Error("建立治療紀錄失敗");

  await logAudit({ caseId, operatorName: operator, action: "add_treatment_record", entity: "treatment_records", entityId: record.id });

  // 登打「手術切除」時，依個案部位分類自動產生放療待辦（決策 2026-07-26）
  const { data: treatmentType } = await supabase.from("treatment_types").select("name").eq("id", treatmentTypeId).single();
  if (treatmentType?.name === "手術切除") {
    await generateRadiotherapySessions(supabase, caseId, treatmentDate, record.id);
  }

  revalidatePath(`/cases/${caseId}`);
}

async function generateRadiotherapySessions(
  supabase: ReturnType<typeof supabaseServer>,
  caseId: string,
  surgeryDate: string,
  treatmentRecordId: string
) {
  const { data: caseRow } = await supabase
    .from("cases")
    .select("body_part_zones(dose_category)")
    .eq("id", caseId)
    .single();
  const zone = caseRow ? (Array.isArray(caseRow.body_part_zones) ? caseRow.body_part_zones[0] : caseRow.body_part_zones) : null;
  if (!zone?.dose_category) return; // 尚未標記部位，無法判斷劑量分類，不自動排程

  const { data: protocol } = await supabase
    .from("radiotherapy_dose_protocols")
    .select("*")
    .eq("dose_category", zone.dose_category)
    .single();
  if (!protocol) return;

  const rows = Array.from({ length: protocol.fraction_count }, (_, i) => {
    const due = new Date(surgeryDate);
    due.setDate(due.getDate() + i + 1); // 首次為手術隔天（24小時內），之後連續每日一次
    return {
      case_id: caseId,
      dose_category: zone.dose_category,
      fraction_no: i + 1,
      total_fractions: protocol.fraction_count,
      planned_dose_cgy: protocol.per_fraction_dose_cgy,
      due_date: due.toISOString().slice(0, 10),
      triggered_by_treatment_record_id: treatmentRecordId,
    };
  });
  await supabase.from("radiotherapy_sessions").insert(rows);
}

export async function markRadiotherapySessionAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const sessionId = formData.get("session_id") as string;
  const status = formData.get("status") as string;
  const actualDoseCgy = formData.get("actual_dose_cgy") as string;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase
    .from("radiotherapy_sessions")
    .update({
      status,
      completed_date: status === "done" ? new Date().toISOString().slice(0, 10) : null,
      actual_dose_cgy: actualDoseCgy ? Number(actualDoseCgy) : null,
    })
    .eq("id", sessionId);

  await logAudit({ caseId, operatorName: operator, action: "update_radiotherapy_session", entity: "radiotherapy_sessions", entityId: sessionId, detail: { status } });
  revalidatePath(`/cases/${caseId}`);
}

export async function updateBiobankChecklistAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const itemKey = formData.get("item_key") as string;
  const itemLabel = formData.get("item_label") as string;
  const collected = formData.get("collected") === "on";
  const collectedDate = (formData.get("collected_date") as string) || null;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase
    .from("biobank_checklist_items")
    .upsert(
      {
        case_id: caseId,
        item_key: itemKey,
        item_label: itemLabel,
        collected,
        collected_date: collected ? collectedDate : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "case_id,item_key" }
    );

  await logAudit({ caseId, operatorName: operator, action: "update_biobank_checklist", entity: "biobank_checklist_items", detail: { itemKey, collected } });
  revalidatePath(`/cases/${caseId}`);
}

export async function setCaseBodyZoneAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const zoneId = formData.get("zone_id") as string;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  const { data: zone } = await supabase.from("body_part_zones").select("display_name").eq("id", zoneId).single();
  await supabase.from("cases").update({ body_part_zone_id: zoneId, body_site: zone?.display_name ?? null }).eq("id", caseId);

  await logAudit({ caseId, operatorName: operator, action: "set_body_zone", entity: "cases", detail: { zoneId } });
  revalidatePath(`/cases/${caseId}`);
}

export async function markScheduleItemAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const itemId = formData.get("item_id") as string;
  const status = formData.get("status") as string;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase
    .from("case_schedule_items")
    .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
    .eq("id", itemId);

  await logAudit({ caseId, operatorName: operator, action: "update_schedule_item", entity: "case_schedule_items", entityId: itemId, detail: { status } });
  revalidatePath(`/cases/${caseId}`);
}

export async function updateCompletenessAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const fieldKey = formData.get("field_key") as string;
  const status = formData.get("status") as string;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase
    .from("case_data_completeness")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("case_id", caseId)
    .eq("field_key", fieldKey);

  await logAudit({ caseId, operatorName: operator, action: "update_completeness", entity: "case_data_completeness", detail: { fieldKey, status } });
  revalidatePath(`/cases/${caseId}`);
}

export async function updateConsentAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const consentSignedAt = formData.get("consent_signed_at") as string;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase
    .from("cases")
    .update({ consent_signed_at: consentSignedAt || null, consent_confirmed_by: consentSignedAt ? operator : null })
    .eq("id", caseId);

  await logAudit({ caseId, operatorName: operator, action: "update_consent", entity: "cases", detail: { consentSignedAt } });
  revalidatePath(`/cases/${caseId}`);
}
