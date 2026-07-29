"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";
import { withTermGroup } from "@/lib/terms";

async function operatorOrThrow() {
  const op = await getCurrentOperator();
  if (!op) throw new Error("未選擇操作者");
  return op;
}

// cases.body_site 是病灶清單的去正規化摘要（個案列表、搜尋、dashboard 統計都讀這欄）。
// 病灶清單異動後同步一次；清單被清空時保留原值不覆寫成 null，避免洗掉舊資料匯入的部位文字。
async function syncCaseBodySite(supabase: ReturnType<typeof supabaseServer>, caseId: string) {
  const { data: lesions } = await supabase
    .from("case_keloid_lesions")
    .select("body_site")
    .eq("case_id", caseId)
    .order("site_no");
  if (!lesions || lesions.length === 0) return;
  await supabase
    .from("cases")
    .update({ body_site: lesions.map((l) => l.body_site).join("、") })
    .eq("id", caseId);
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
  // 「其他」自填術語（決策 2026-07-28）：清單沒有的用語當場輸入，並直接進 term_library，
  // 之後同階段的其他個案就能直接勾選，後台「醫學術語庫」也能編輯/停用它。
  // 送出時若正篩在某個子分類上，就補上【子分類】前綴，讓它跟同組的用語排在一起（2026-07-29）。
  const otherTermGroup = ((formData.get("other_term_group") as string) || "").trim() || null;
  const otherTerms = (formData.getAll("other_terms") as string[])
    .flatMap((raw) => (raw ?? "").split(/[、,，\n]/))
    .map((t) => withTermGroup(t, otherTermGroup))
    .filter(Boolean);
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  const allTermIds = [...termIds];
  for (const term of otherTerms) {
    // 同階段同名的術語只留一則（可能已停用，這時一併重新啟用）
    const { data: existing } = await supabase
      .from("term_library")
      .select("id")
      .eq("stage", stage)
      .eq("term", term)
      .maybeSingle();
    if (existing) {
      await supabase.from("term_library").update({ active: true }).eq("id", existing.id);
      if (!allTermIds.includes(existing.id)) allTermIds.push(existing.id);
      continue;
    }
    // 排序：有指定子分類就接在該組最後一則後面（清單與後台才會跟同組的排在一起），
    // 沒指定就丟到該階段最後。
    let sortOrder = 999;
    if (otherTermGroup) {
      const { data: groupLast } = await supabase
        .from("term_library")
        .select("sort_order")
        .eq("stage", stage)
        .like("term", `【${otherTermGroup}】%`)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (groupLast) sortOrder = (groupLast.sort_order ?? 0) + 1;
    }
    const { data: created } = await supabase
      .from("term_library")
      .insert({ stage, term, sort_order: sortOrder })
      .select("id")
      .single();
    if (created) allTermIds.push(created.id);
  }

  const { data: record, error } = await supabase
    .from("case_term_records")
    .insert({ case_id: caseId, stage, recorded_by: operator })
    .select("id")
    .single();
  if (error || !record) throw error ?? new Error("建立術語紀錄失敗");

  if (allTermIds.length > 0) {
    await supabase
      .from("case_term_record_items")
      .insert(allTermIds.map((termId) => ({ record_id: record.id, term_id: termId })));
  }

  await logAudit({
    caseId,
    operatorName: operator,
    action: "add_term_record",
    entity: "case_term_records",
    entityId: record.id,
    detail: { stage, termIds: allTermIds, otherTerms },
  });
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/admin/terms");
}

export async function addTreatmentRecordAction(formData: FormData): Promise<number> {
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

  // 部位（決策 2026-07-27 多部位整合）：可勾選多個已登記病灶，另可自由輸入一個未登記的部位。
  // 每個部位 × 每種治療方式各建一筆紀錄，這樣「手術切除」才能依各部位自己的劑量分類各跑一組放療。
  const lesionIds = formData.getAll("lesion_ids") as string[];
  const freeTextSite = ((formData.get("body_site") as string) || "").trim();

  const { data: lesions } = lesionIds.length
    ? await supabase.from("case_keloid_lesions").select("id, site_no, body_site").in("id", lesionIds)
    : { data: [] };

  const targets: { lesionId: string | null; bodySite: string | null }[] = [
    ...(lesions ?? []).map((l) => ({ lesionId: l.id, bodySite: l.body_site })),
    ...(freeTextSite ? [{ lesionId: null, bodySite: freeTextSite }] : []),
  ];
  // 完全沒指定部位時仍建立一筆（沿用舊行為，部位留空）
  if (targets.length === 0) targets.push({ lesionId: null, bodySite: null });

  const { data: treatmentTypes } = await supabase
    .from("treatment_types")
    .select("id, name")
    .in("id", treatmentTypeIds);

  const createdRecordIds: { id: string; typeName: string | undefined; lesionId: string | null }[] = [];

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

    for (const target of targets) {
      const { data: record, error } = await supabase
        .from("treatment_records")
        .insert({
          case_id: caseId,
          treatment_type_id: typeId,
          preset_id: presetId,
          field_values: fieldValues,
          free_text: freeText,
          treatment_date: treatmentDate,
          lesion_id: target.lesionId,
          body_site: target.bodySite,
          recorded_by: operator,
          recurrence_observed: recurrenceObserved,
          recurrence_description: recurrenceDescription,
          blood_drawn: bloodDrawn,
          blood_drawn_note: bloodDrawnNote,
        })
        .select("id")
        .single();
      if (error || !record) throw error ?? new Error("建立治療紀錄失敗");

      createdRecordIds.push({
        id: record.id,
        typeName: treatmentTypes?.find((t) => t.id === typeId)?.name,
        lesionId: target.lesionId,
      });
    }
  }

  await logAudit({
    caseId,
    operatorName: operator,
    action: "add_treatment_record",
    entity: "treatment_records",
    detail: { typeIds: treatmentTypeIds, siteCount: targets.length, count: createdRecordIds.length },
  });

  // 登打「手術切除」時，依該筆對應部位的劑量分類自動產生放療待辦（決策 2026-07-26，
  // 2026-07-27 改為每個手術部位各一組療程）
  for (const surgeryRecord of createdRecordIds.filter((r) => r.typeName === "手術切除")) {
    await generateRadiotherapySessions(supabase, caseId, treatmentDate, surgeryRecord.id, surgeryRecord.lesionId);
  }

  revalidatePath(`/cases/${caseId}`);
  return createdRecordIds.length;
}

// useActionState 用的包裝：把成功/失敗結果回傳給 TreatmentForm，
// 讓表單能顯示「已儲存 N 筆」並在成功後清空勾選（先前送出後畫面毫無變化，會誤以為沒存到）。
export type TreatmentFormState = { ok: boolean; message: string; at: number } | null;

export async function submitTreatmentRecordAction(
  _prev: TreatmentFormState,
  formData: FormData
): Promise<TreatmentFormState> {
  try {
    const count = await addTreatmentRecordAction(formData);
    return { ok: true, message: `已新增 ${count} 筆治療/追蹤紀錄`, at: Date.now() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "儲存失敗", at: Date.now() };
  }
}

// 已儲存的治療紀錄可回頭修改（日期打錯、欄位值要補、復發/抽血當下沒勾到等）。
// 不動 treatment_type_id 與 lesion_id：改治療類型或部位等於換一筆紀錄，請刪除後重建，
// 否則已依「手術切除＋部位分類」產生的放療排程會跟紀錄對不起來。
export async function updateTreatmentRecordAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const recordId = formData.get("record_id") as string;
  const treatmentDate = formData.get("treatment_date") as string;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  const fieldValues: Record<string, string> = {};
  const prefix = "field__";
  for (const [key, value] of formData.entries()) {
    if (key.startsWith(prefix) && typeof value === "string" && value !== "") {
      fieldValues[key.replace(prefix, "")] = value;
    }
  }

  await supabase
    .from("treatment_records")
    .update({
      treatment_date: treatmentDate,
      body_site: ((formData.get("body_site") as string) || "").trim() || null,
      field_values: fieldValues,
      free_text: (formData.get("free_text") as string) || null,
      recurrence_observed: formData.get("recurrence_observed") === "on",
      recurrence_description: (formData.get("recurrence_description") as string) || null,
      blood_drawn: formData.get("blood_drawn") === "on",
      blood_drawn_note: (formData.get("blood_drawn_note") as string) || null,
    })
    .eq("id", recordId);

  await logAudit({
    caseId,
    operatorName: operator,
    action: "update_treatment_record",
    entity: "treatment_records",
    entityId: recordId,
    detail: { treatmentDate },
  });
  revalidatePath(`/cases/${caseId}`);
}

export async function deleteTreatmentRecordAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const recordId = formData.get("record_id") as string;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  // 這筆紀錄自動產生的放療排程一併刪除（外鍵是 no action，不先刪會擋住）。
  await supabase.from("radiotherapy_sessions").delete().eq("triggered_by_treatment_record_id", recordId);
  await supabase.from("treatment_records").delete().eq("id", recordId);

  await logAudit({
    caseId,
    operatorName: operator,
    action: "delete_treatment_record",
    entity: "treatment_records",
    entityId: recordId,
  });
  revalidatePath(`/cases/${caseId}`);
}

// 一個手術部位＝一組放療療程。劑量分類取自該病灶自己的 body_part_zone（決策 2026-07-27 多部位整合）。
async function generateRadiotherapySessions(
  supabase: ReturnType<typeof supabaseServer>,
  caseId: string,
  surgeryDate: string,
  treatmentRecordId: string,
  lesionId: string | null
) {
  if (!lesionId) return; // 未指定部位（自由文字或留空）就無從判斷劑量分類，不自動排程

  const { data: lesion } = await supabase
    .from("case_keloid_lesions")
    .select("body_part_zones(dose_category)")
    .eq("id", lesionId)
    .single();
  const zone = lesion
    ? Array.isArray(lesion.body_part_zones)
      ? lesion.body_part_zones[0]
      : lesion.body_part_zones
    : null;
  if (!zone?.dose_category) return; // 該部位尚未指定部位分類，不自動排程

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
      lesion_id: lesionId,
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

// 個案的時程項目是套用範本時複製自 schedule_template_items 的快照，原本事後只能沿用範本指定的問卷。
// 這支 action 讓單一個案的單一時間點可以改填別份問卷（只動這筆 case_schedule_items，不影響範本本身，
// 也不影響同範本其他個案）。questionnaire_id 傳空字串＝清除指定。
export async function updateScheduleItemQuestionnaireAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const itemId = formData.get("item_id") as string;
  const questionnaireId = (formData.get("questionnaire_id") as string) || null;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  const { data: item } = await supabase
    .from("case_schedule_items")
    .select("actions")
    .eq("id", itemId)
    .single();

  // 指定問卷但該項目原本沒有「填問卷」動作時一併補上，否則個案頁面不會出現填寫連結
  const actions: string[] = item?.actions ?? [];
  const nextActions =
    questionnaireId && !actions.includes("questionnaire") ? [...actions, "questionnaire"] : actions;

  await supabase
    .from("case_schedule_items")
    .update({ questionnaire_id: questionnaireId, actions: nextActions })
    .eq("id", itemId);

  await logAudit({
    caseId,
    operatorName: operator,
    action: "update_schedule_item_questionnaire",
    entity: "case_schedule_items",
    entityId: itemId,
    detail: { questionnaireId },
  });
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
  const familyHistory = (formData.get("family_history") as string) || null;
  const jswScore = (formData.get("jsw_score") as string) || null;
  // 手機號碼原本只有建檔頁能填，個案頁沒有欄位可補（完整度清單卻會列「手機」待補），2026-07-28 補上。
  const phoneNumber = ((formData.get("phone_number") as string) ?? "").trim() || null;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase
    .from("cases")
    .update({
      sex,
      age_at_enrollment: ageRaw ? Number(ageRaw) : null,
      family_history: familyHistory,
      jsw_score: jswScore,
      phone_number: phoneNumber,
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

// 一次橫向填寫所有標記（決策 2026-07-28）：同一次採檢的所有標記共用一個採檢日期，
// 一次送出、只寫有填值的標記（留空＝這次沒驗這項，不建立空白列）。
export async function addLabResultsBatchAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const sampleDate = (formData.get("sample_date") as string) || new Date().toISOString().slice(0, 10);
  const note = ((formData.get("note") as string) || "").trim() || null;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  const prefix = "value__";
  const rows: {
    case_id: string;
    marker_id: string;
    sample_date: string;
    value: number | null;
    value_text: string | null;
    note: string | null;
    recorded_by: string;
  }[] = [];

  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith(prefix) || typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value) continue; // 可 null：沒填的項目直接略過
    const numeric = Number.isNaN(Number(value)) ? null : Number(value);
    rows.push({
      case_id: caseId,
      marker_id: key.slice(prefix.length),
      sample_date: sampleDate,
      value: numeric,
      value_text: numeric === null ? value : null, // 例如 "<0.35" 這類非數值結果
      note,
      recorded_by: operator,
    });
  }

  if (rows.length === 0) return;

  const { error } = await supabase.from("lab_results").insert(rows);
  if (error) throw error;

  await logAudit({
    caseId,
    operatorName: operator,
    action: "add_lab_results_batch",
    entity: "lab_results",
    detail: { sampleDate, count: rows.length },
  });
  revalidatePath(`/cases/${caseId}`);
}

export async function deleteLabResultAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const resultId = formData.get("result_id") as string;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase.from("lab_results").delete().eq("id", resultId);

  await logAudit({ caseId, operatorName: operator, action: "delete_lab_result", entity: "lab_results", entityId: resultId });
  revalidatePath(`/cases/${caseId}`);
}

export async function deletePhotoAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const photoId = formData.get("photo_id") as string;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  const { data: photo } = await supabase
    .from("photos")
    .select("file_path, thumbnail_path")
    .eq("id", photoId)
    .single();
  if (!photo) return;

  const paths = [photo.file_path, photo.thumbnail_path].filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    await supabase.storage.from("wound-photos").remove(paths);
  }
  await supabase.from("photos").delete().eq("id", photoId);

  await logAudit({ caseId, operatorName: operator, action: "delete_photo", entity: "photos", entityId: photoId });
  revalidatePath(`/cases/${caseId}`);
}

export async function addKeloidLesionAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const bodyPartZoneId = ((formData.get("body_part_zone_id") as string) || "").trim() || null;
  const bodySite = (formData.get("body_site") as string)?.trim();
  const lengthRaw = (formData.get("length_cm") as string)?.trim();
  const widthRaw = (formData.get("width_cm") as string)?.trim();
  const heightRaw = (formData.get("height_cm") as string)?.trim();
  const note = (formData.get("note") as string)?.trim() || null;
  if (!bodySite) return;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  // 部位編號（部位1,2,…）：取該個案目前最大編號 +1，讓拍照時可依序點選對應部位。
  const { data: lastSite } = await supabase
    .from("case_keloid_lesions")
    .select("site_no")
    .eq("case_id", caseId)
    .order("site_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSiteNo = (lastSite?.site_no ?? 0) + 1;

  const { data: lesion, error } = await supabase
    .from("case_keloid_lesions")
    .insert({
      case_id: caseId,
      site_no: nextSiteNo,
      body_site: bodySite,
      body_part_zone_id: bodyPartZoneId,
      length_cm: lengthRaw ? Number(lengthRaw) : null,
      width_cm: widthRaw ? Number(widthRaw) : null,
      height_cm: heightRaw ? Number(heightRaw) : null,
      note,
    })
    .select("id")
    .single();
  if (error || !lesion) throw error ?? new Error("新增病灶測量失敗");

  await syncCaseBodySite(supabase, caseId);
  await logAudit({ caseId, operatorName: operator, action: "add_keloid_lesion", entity: "case_keloid_lesions", entityId: lesion.id, detail: { bodySite, bodyPartZoneId } });
  revalidatePath(`/cases/${caseId}`);
}

// 指定/更換某個病灶的部位分類（決定該部位自己的放療劑量方案）。
// 就地編輯部位的名稱／尺寸／備註。刻意跟「刪除後重建」區隔：重建會讓已綁定的照片
// 掉成「未對應部位」（photos.lesion_id 是 on delete set null）、該部位的放療排程被刪、
// 而且 site_no 會拿新號碼造成跳號。改用 update 就完全不動這三者。
// site_no 不開放修改：照片的 body_site 當初就寫死「部位N ○○」的文字，改編號會讓舊照片的標籤對不上。
export async function updateKeloidLesionAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const lesionId = formData.get("lesion_id") as string;
  const bodySite = (formData.get("body_site") as string)?.trim();
  const lengthRaw = (formData.get("length_cm") as string)?.trim();
  const widthRaw = (formData.get("width_cm") as string)?.trim();
  const heightRaw = (formData.get("height_cm") as string)?.trim();
  const note = (formData.get("note") as string)?.trim() || null;
  if (!bodySite) return;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase
    .from("case_keloid_lesions")
    .update({
      body_site: bodySite,
      length_cm: lengthRaw ? Number(lengthRaw) : null,
      width_cm: widthRaw ? Number(widthRaw) : null,
      height_cm: heightRaw ? Number(heightRaw) : null,
      note,
    })
    .eq("id", lesionId);

  // cases.body_site 是病灶清單的去正規化摘要，改名後要跟著更新
  await syncCaseBodySite(supabase, caseId);

  await logAudit({
    caseId,
    operatorName: operator,
    action: "update_keloid_lesion",
    entity: "case_keloid_lesions",
    entityId: lesionId,
    detail: { bodySite },
  });
  revalidatePath(`/cases/${caseId}`);
}

export async function updateKeloidLesionZoneAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const lesionId = formData.get("lesion_id") as string;
  const zoneId = ((formData.get("body_part_zone_id") as string) || "").trim() || null;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase.from("case_keloid_lesions").update({ body_part_zone_id: zoneId }).eq("id", lesionId);

  await logAudit({ caseId, operatorName: operator, action: "update_keloid_lesion_zone", entity: "case_keloid_lesions", entityId: lesionId, detail: { zoneId } });
  revalidatePath(`/cases/${caseId}`);
}

export async function deleteKeloidLesionAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const lesionId = formData.get("lesion_id") as string;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase.from("case_keloid_lesions").delete().eq("id", lesionId);

  await syncCaseBodySite(supabase, caseId);
  await logAudit({ caseId, operatorName: operator, action: "delete_keloid_lesion", entity: "case_keloid_lesions", entityId: lesionId });
  revalidatePath(`/cases/${caseId}`);
}
