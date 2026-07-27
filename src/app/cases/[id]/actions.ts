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
  const treatmentTypeIds = formData.getAll("type_ids") as string[];
  const treatmentDate = formData.get("treatment_date") as string;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  if (treatmentTypeIds.length === 0) throw new Error("請至少選擇一種治療方式");

  // 當次追蹤共同的觀察欄位（決策 2026-07-27：治療方式可複選多筆，
  // 復發與抽血改為每次追蹤都可記錄，非個案層級單一快照）
  const recurrenceObserved = formData.has("recurrence_observed") ? formData.get("recurrence_observed") === "on" : null;
  const recurrenceDescription = (formData.get("recurrence_description") as string) || null;
  const bloodDrawn = formData.get("blood_drawn") === "on";
  const bloodDrawnNote = (formData.get("blood_drawn_note") as string) || null;

  const { data: treatmentTypes } = await supabase
    .from("treatment_types")
    .select("id, name")
    .in("id", treatmentTypeIds);

  const createdRecordIds: { id: string; typeName: string | undefined }[] = [];

  for (const typeId of treatmentTypeIds) {
    const presetId = (formData.get(`preset__${typeId}`) as string) || null;
    const freeText = (formData.get(`freetext__${typeId}`) as string) || null;

    const fieldValues: Record<string, string> = {};
    const prefix = `field__${typeId}__`;
    for (const [key, value] of formData.entries()) {
      if (key.startsWith(prefix) && typeof value === "string" && value !== "") {
        fieldValues[key.replace(prefix, "")] = value;
      }
    }

    const { data: record, error } = await supabase
      .from("treatment_records")
      .insert({
        case_id: caseId,
        treatment_type_id: typeId,
        preset_id: presetId,
        field_values: fieldValues,
        free_text: freeText,
        treatment_date: treatmentDate,
        recorded_by: operator,
        recurrence_observed: recurrenceObserved,
        recurrence_description: recurrenceDescription,
        blood_drawn: bloodDrawn,
        blood_drawn_note: bloodDrawnNote,
      })
      .select("id")
      .single();
    if (error || !record) throw error ?? new Error("建立治療紀錄失敗");

    createdRecordIds.push({ id: record.id, typeName: treatmentTypes?.find((t) => t.id === typeId)?.name });
  }

  await logAudit({
    caseId,
    operatorName: operator,
    action: "add_treatment_record",
    entity: "treatment_records",
    detail: { typeIds: treatmentTypeIds, count: createdRecordIds.length },
  });

  // 登打「手術切除」時，依個案部位分類自動產生放療待辦（決策 2026-07-26）
  const surgeryRecord = createdRecordIds.find((r) => r.typeName === "手術切除");
  if (surgeryRecord) {
    await generateRadiotherapySessions(supabase, caseId, treatmentDate, surgeryRecord.id);
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

export async function updateDemographicsAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const sex = (formData.get("sex") as string) || null;
  const ageRaw = formData.get("age_at_enrollment") as string;
  const keloidHistory = (formData.get("keloid_history") as string) || null;
  const keloidSize = (formData.get("keloid_size") as string) || null;
  const familyHistory = (formData.get("family_history") as string) || null;
  const jswScore = (formData.get("jsw_score") as string) || null;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase
    .from("cases")
    .update({
      sex,
      age_at_enrollment: ageRaw ? Number(ageRaw) : null,
      keloid_history: keloidHistory,
      keloid_size: keloidSize,
      family_history: familyHistory,
      jsw_score: jswScore,
    })
    .eq("id", caseId);

  await logAudit({ caseId, operatorName: operator, action: "update_demographics", entity: "cases" });
  revalidatePath(`/cases/${caseId}`);
}

export async function updateOutcomeAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const recurrenceStatus = (formData.get("recurrence_status") as string) || null;
  const recurrenceDate = (formData.get("recurrence_date") as string) || null;
  const daysToRecurrenceRaw = formData.get("days_to_recurrence") as string;
  const followupCutoffDate = (formData.get("followup_cutoff_date") as string) || null;
  const overOneYearFlag = formData.get("over_one_year_flag") === "on";
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase
    .from("cases")
    .update({
      recurrence_status: recurrenceStatus,
      recurrence_date: recurrenceDate,
      days_to_recurrence: daysToRecurrenceRaw ? Number(daysToRecurrenceRaw) : null,
      followup_cutoff_date: followupCutoffDate,
      over_one_year_flag: overOneYearFlag,
    })
    .eq("id", caseId);

  await logAudit({ caseId, operatorName: operator, action: "update_outcome", entity: "cases" });
  revalidatePath(`/cases/${caseId}`);
}

export async function updateLegacyBiobankAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const paraffinBlockNo = (formData.get("paraffin_block_no") as string) || null;
  const cryotubeLocation = (formData.get("cryotube_location") as string) || null;
  const cellQuantity = (formData.get("cell_quantity") as string) || null;
  const storagePlateCount = (formData.get("storage_plate_count") as string) || null;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase
    .from("biobank_samples")
    .upsert(
      {
        case_id: caseId,
        paraffin_block_no: paraffinBlockNo,
        cryotube_location: cryotubeLocation,
        cell_quantity: cellQuantity,
        storage_plate_count: storagePlateCount,
      },
      { onConflict: "case_id" }
    );

  await logAudit({ caseId, operatorName: operator, action: "update_legacy_biobank", entity: "biobank_samples" });
  revalidatePath(`/cases/${caseId}`);
}

export async function updatePriorHistoryAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  const fields = [
    "keloid_onset_date",
    "disease_history",
    "prior_treatment_physician",
    "prior_steroid_treatment",
    "prior_tcm_treatment",
    "prior_ogawa_patch",
    "prior_radiation_treatment",
  ] as const;

  const update: Record<string, string | null> = {};
  for (const f of fields) update[f] = (formData.get(f) as string) || null;

  await supabase.from("cases").update(update).eq("id", caseId);

  await logAudit({ caseId, operatorName: operator, action: "update_prior_history", entity: "cases" });
  revalidatePath(`/cases/${caseId}`);
}

export async function addIntakeOptionRecordAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const category = formData.get("category") as string;
  const optionIds = formData.getAll("option_ids") as string[];
  const notes = (formData.get("notes") as string) || null;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  const { data: record, error } = await supabase
    .from("case_intake_option_records")
    .insert({ case_id: caseId, category, recorded_by: operator, notes })
    .select("id")
    .single();
  if (error || !record) throw error ?? new Error("建立紀錄失敗");

  if (optionIds.length > 0) {
    await supabase
      .from("case_intake_option_record_items")
      .insert(optionIds.map((optionId) => ({ record_id: record.id, option_id: optionId })));
  }

  await logAudit({ caseId, operatorName: operator, action: "add_intake_option_record", entity: "case_intake_option_records", entityId: record.id, detail: { category, optionIds } });
  revalidatePath(`/cases/${caseId}`);
}

export async function addLabResultAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const markerId = formData.get("marker_id") as string;
  const sampleDate = (formData.get("sample_date") as string) || new Date().toISOString().slice(0, 10);
  const rawValue = (formData.get("value") as string)?.trim();
  const note = (formData.get("note") as string) || null;
  if (!markerId) return;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  const numericValue = rawValue && !Number.isNaN(Number(rawValue)) ? Number(rawValue) : null;
  const valueText = rawValue && numericValue === null ? rawValue : null;

  const { data: result, error } = await supabase
    .from("lab_results")
    .insert({
      case_id: caseId,
      marker_id: markerId,
      sample_date: sampleDate,
      value: numericValue,
      value_text: valueText,
      note,
      recorded_by: operator,
    })
    .select("id")
    .single();
  if (error || !result) throw error ?? new Error("建立 Lab 數據失敗");

  await logAudit({ caseId, operatorName: operator, action: "add_lab_result", entity: "lab_results", entityId: result.id, detail: { markerId, sampleDate } });
  revalidatePath(`/cases/${caseId}`);
}
