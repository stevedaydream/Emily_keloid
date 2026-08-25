"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";
import { withTermGroup } from "@/lib/terms";
import { generateBindCode, BIND_CODE_TTL_HOURS } from "@/lib/line";
import { onsetMonthToDate } from "@/lib/onsetMonth";
import { BIOBANK_ITEM_LABEL, bloodDrawWindows, followupSchedule } from "@/lib/biobank";

/** 伺服器跑 UTC，直接 toISOString() 早上八點前會少一天。日期欄位一律走這支。 */
function todayInTaipei(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date());
}

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
  // 症狀變化（docx 2026-08-12）：對應部長新版 Excel Year 1 的 FW_k_symptom 碼 1-6
  const symptomChangeOptionId = ((formData.get("symptom_change_option_id") as string) || "").trim() || null;

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
          symptom_change_option_id: symptomChangeOptionId,
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

  // 登打「手術切除」時，依該筆對應部位產生放療待辦（決策 2026-07-26，
  // 2026-07-27 改為每個手術部位各一組療程，2026-08-13 改為由表單逐部位確認次數與劑量）。
  //
  // 表單會為每個勾選到的部位送出 rtplan__<lesionId>__on / __fractions / __dose / __firstday。
  // 沒有 __on＝使用者取消了那個部位的放療（checkbox 未勾選不會送出），整組不排。
  for (const surgeryRecord of createdRecordIds.filter((r) => r.typeName === "手術切除")) {
    const lid = surgeryRecord.lesionId;
    if (!lid) continue; // 自由輸入的部位沒有分類，無從排程
    if (formData.get(`rtplan__${lid}__on`) !== "on") continue; // 使用者明確不排
    const fractions = Number(formData.get(`rtplan__${lid}__fractions`)) || null;
    const doseCgy = Number(formData.get(`rtplan__${lid}__dose`)) || null;
    // 首次日：1＝手術隔天（預設）、0＝手術當天。都在術後 24 小時內，
    // 差別是手術排在早上、當天下午就能照的情況（2026-08-13 提出）。
    const firstDayOffset = formData.get(`rtplan__${lid}__firstday`) === "0" ? 0 : 1;
    await generateRadiotherapySessions(supabase, caseId, treatmentDate, surgeryRecord.id, lid, fractions, doseCgy, firstDayOffset);
  }

  // 手術一登記就以手術日為錨點產生術後追蹤與後三次抽血（決策 2026-08-20，見 pending.md F-D1 / F-E2）。
  // 追蹤時程原本在收案時以「建檔日」起算，但匯出的 FW 欄位、追蹤規則、抽血時程全部以手術日為準；
  // 收案到手術有時間差時，建檔日起算的日期會整批提早，變成病人還沒開刀就被叫回診。
  if (createdRecordIds.some((r) => r.typeName === "手術切除")) {
    await generatePostOpSchedule(supabase, caseId, treatmentDate, operator);
  }

  revalidatePath(`/cases/${caseId}`);
  return createdRecordIds.length;
}

/**
 * 術後時程：每月一次 × 24 個月（＝匯出的 FW1–FW24）＋ 第 2/3/4 次抽血。
 * 只在還沒產生過時建立，避免同一個案重複登記手術切除時長出兩套。
 */
async function generatePostOpSchedule(
  supabase: ReturnType<typeof supabaseServer>,
  caseId: string,
  surgeryDate: string,
  operator: string
) {
  const { data: existing } = await supabase
    .from("case_schedule_items")
    .select("id")
    .eq("case_id", caseId)
    .eq("source", "post_op")
    .limit(1);
  if (existing && existing.length > 0) return;

  const followups = followupSchedule(surgeryDate).map((f) => ({
    case_id: caseId,
    label: f.label,
    due_date: f.dueDate,
    actions: ["visit_reminder"],
    source: "post_op",
  }));

  // 抽血項目同時掛 checklist（人只勾一次，標記完成時回寫 collected/collected_date）
  const draws = bloodDrawWindows(surgeryDate);
  const drawItems = draws.map((d) => ({
    case_id: caseId,
    label: d.label,
    due_date: d.dueDate,
    actions: ["blood_draw"],
    source: "post_op",
    biobank_item_key: d.key,
  }));

  await supabase.from("case_schedule_items").insert([...followups, ...drawItems]);

  await supabase.from("biobank_checklist_items").upsert(
    draws.map((d) => ({
      case_id: caseId,
      item_key: d.key,
      item_label: BIOBANK_ITEM_LABEL[d.key],
      collected: false,
      window_start: d.windowStart,
      window_end: d.windowEnd,
    })),
    { onConflict: "case_id,item_key" }
  );

  await logAudit({
    caseId,
    operatorName: operator,
    action: "generate_post_op_schedule",
    entity: "case_schedule_items",
    detail: { surgeryDate, followups: followups.length, draws: draws.length },
  });
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

  // 放療排程要跟著手術日期移，所以得先拿到改動「前」的日期算位移量。
  const { data: before } = await supabase
    .from("treatment_records")
    .select("treatment_date")
    .eq("id", recordId)
    .single();

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
      symptom_change_option_id: ((formData.get("symptom_change_option_id") as string) || "").trim() || null,
    })
    .eq("id", recordId);

  // 手術日期改了，這筆手術自動產生的放療排程要跟著移（2026-08-13）。
  // 放療第 1 次必須在術後 24 小時內、之後每天一次，日期不是隨便排的；
  // 先前改手術日期不會動排程，等於把第 1 次推到術後好幾天，臨床上是錯的。
  // 已標記完成的不動——那是實際做過的日子，不能被往後算的排程蓋掉。
  const shifted = await shiftRadiotherapySessions(supabase, recordId, before?.treatment_date ?? null, treatmentDate);

  await logAudit({
    caseId,
    operatorName: operator,
    action: "update_treatment_record",
    entity: "treatment_records",
    entityId: recordId,
    detail: { treatmentDate, shiftedRtSessions: shifted },
  });
  revalidatePath(`/cases/${caseId}`);
}

const DAY_MS = 86_400_000;

/**
 * 手術日期改了，把該手術產生的放療排程整組平移相同天數。
 *
 * 用「位移量」而不是拿新手術日重算（`手術日 + fraction_no`），因為首次日可選當天或隔天，
 * 重算會把使用者選過的當天/隔天洗掉；平移則不論當初選哪一種都維持原本的間距。
 * 已標記完成的不動——那是實際做過的日子，不能被排程蓋掉。
 *
 * @returns 實際移動的次數
 */
async function shiftRadiotherapySessions(
  supabase: ReturnType<typeof supabaseServer>,
  treatmentRecordId: string,
  oldSurgeryDate: string | null,
  newSurgeryDate: string
): Promise<number> {
  if (!oldSurgeryDate || !newSurgeryDate || oldSurgeryDate === newSurgeryDate) return 0;
  const deltaDays = Math.round((new Date(newSurgeryDate).getTime() - new Date(oldSurgeryDate).getTime()) / DAY_MS);
  if (!deltaDays) return 0;

  const { data: sessions } = await supabase
    .from("radiotherapy_sessions")
    .select("id, due_date, status")
    .eq("triggered_by_treatment_record_id", treatmentRecordId);
  if (!sessions?.length) return 0;

  let moved = 0;
  for (const s of sessions) {
    if (s.status === "done") continue;
    const due = new Date(s.due_date);
    due.setDate(due.getDate() + deltaDays);
    await supabase.from("radiotherapy_sessions").update({ due_date: due.toISOString().slice(0, 10) }).eq("id", s.id);
    moved++;
  }
  return moved;
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
//
// fractionsOverride / doseOverride 是治療表單上「放療排程確認」逐部位填的值（2026-08-13）：
// 預設帶該分類的標準療程，使用者可當場改。沒帶就退回標準療程。
async function generateRadiotherapySessions(
  supabase: ReturnType<typeof supabaseServer>,
  caseId: string,
  surgeryDate: string,
  treatmentRecordId: string,
  lesionId: string | null,
  fractionsOverride?: number | null,
  doseOverride?: number | null,
  /** 第 1 次距手術幾天：1＝隔天（預設）、0＝手術當天 */
  firstDayOffset: number = 1
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

  const fractionCount = fractionsOverride && fractionsOverride > 0 ? fractionsOverride : protocol.fraction_count;
  const perFractionDose = doseOverride && doseOverride > 0 ? doseOverride : protocol.per_fraction_dose_cgy;

  const rows = Array.from({ length: fractionCount }, (_, i) => {
    const due = new Date(surgeryDate);
    // 第 1 次須在術後 24 小時內：預設排手術隔天，選「手術當天」時 offset 為 0。
    // 之後不論哪一種都是連續每日一次。
    due.setDate(due.getDate() + i + firstDayOffset);
    return {
      case_id: caseId,
      lesion_id: lesionId,
      dose_category: zone.dose_category,
      fraction_no: i + 1,
      total_fractions: fractionCount,
      planned_dose_cgy: perFractionDose,
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
  // 完成日期由人指定（docx 項次 10）：原本寫死成 new Date()，
  // 導致 8/10 做的治療若 8/12 才進系統標記，就被記成 8/12。
  // 表單預設帶排定日期（due_date），實際不同時可當場改；沒給值才退回今天。
  const completedDate = ((formData.get("completed_date") as string) || "").trim();
  const rtDoctor = ((formData.get("rt_doctor") as string) || "").trim() || null;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase
    .from("radiotherapy_sessions")
    .update({
      status,
      completed_date: status === "done" ? completedDate || new Date().toISOString().slice(0, 10) : null,
      actual_dose_cgy: actualDoseCgy ? Number(actualDoseCgy) : null,
      rt_doctor: rtDoctor,
    })
    .eq("id", sessionId);

  await logAudit({ caseId, operatorName: operator, action: "update_radiotherapy_session", entity: "radiotherapy_sessions", entityId: sessionId, detail: { status, completedDate } });
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
  // skipped＝醫師判定穩定、這個月免回診（決策 2026-08-20 F-D3）。項目留著不刪，
  // 但不算逾期、不推 LINE、匯出視同未回診——比直接刪掉更查得到是從第幾個月開始降頻的。
  const skippedReason = ((formData.get("skipped_reason") as string) ?? "").trim() || null;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  const { data: item } = await supabase
    .from("case_schedule_items")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
      skipped_reason: status === "skipped" ? skippedReason ?? "醫師判定穩定，改為每 2 個月追蹤" : null,
    })
    .eq("id", itemId)
    .select("biobank_item_key, due_date")
    .maybeSingle();

  // 抽血類的時程項目標記完成時，單向回寫檢體清單（人只勾一次，兩邊都有紀錄）。
  // 只寫 collected/collected_date，窗期是產生時就定好的，不在這裡動。
  if (item?.biobank_item_key && status === "done") {
    await supabase
      .from("biobank_checklist_items")
      .update({ collected: true, collected_date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() })
      .eq("case_id", caseId)
      .eq("item_key", item.biobank_item_key);
  }

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
  // 身高體重（2026-08-13）：新格式 Basic Info. 需要，BMI 由匯出自動算，這裡不存
  const birthDate = ((formData.get("birth_date") as string) ?? "").trim() || null;
  const heightRaw = ((formData.get("height_cm") as string) ?? "").trim();
  const weightRaw = ((formData.get("weight_kg") as string) ?? "").trim();
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
      birth_date: birthDate,
      height_cm: heightRaw ? Number(heightRaw) : null,
      weight_kg: weightRaw ? Number(weightRaw) : null,
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
  // 初次發生時間的輸入是 <input type="month">，送出的是 `YYYY-MM`，date 欄位吃不了，補成當月 1 日
  update.keloid_onset_date = onsetMonthToDate(update.keloid_onset_date);

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

  // 互斥檢查（docx 2026-08-12：目前不適症狀的「無明顯不適」不可與其他症狀同時勾選）。
  // 前端已擋一次，這裡再擋一次——前端狀態可被繞過，而這條規則會直接影響匯出的 Keloid_symptom 值。
  if (optionIds.length > 1) {
    const { data: exclusive } = await supabase
      .from("case_intake_option_lists")
      .select("id")
      .eq("category", category)
      .eq("label", "無明顯不適")
      .maybeSingle();
    if (exclusive && optionIds.includes(exclusive.id)) {
      throw new Error("「無明顯不適」不能與其他症狀同時勾選");
    }
  }

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

/**
 * 調整病灶順序（助理 2026-08-13 D10：「優先依臨床嚴重度放第一個，嚴重及需開刀的放第一個」）。
 * 與相鄰的病灶對調 site_no。
 *
 * 先前註解寫「部位編號不開放修改，改號會對不上舊照片」——那個顧慮已不成立：
 * photos 是用 lesion_id 外鍵連結病灶，不是靠編號，重排只會改顯示的「部位N」。
 */
export async function moveKeloidLesionAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const lesionId = formData.get("lesion_id") as string;
  const direction = formData.get("direction") as string; // "up" | "down"
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  const { data: lesions } = await supabase
    .from("case_keloid_lesions")
    .select("id, site_no")
    .eq("case_id", caseId)
    .order("site_no", { nullsFirst: false });
  if (!lesions) return;

  const idx = lesions.findIndex((l) => l.id === lesionId);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= lesions.length) return;

  const a = lesions[idx];
  const bb = lesions[swapIdx];
  // 兩筆的 site_no 對調。沒有 (case_id, site_no) 唯一限制，可以直接互換不需暫存值。
  await supabase.from("case_keloid_lesions").update({ site_no: bb.site_no }).eq("id", a.id);
  await supabase.from("case_keloid_lesions").update({ site_no: a.site_no }).eq("id", bb.id);

  await syncCaseBodySite(supabase, caseId);
  await logAudit({
    caseId,
    operatorName: operator,
    action: "move_keloid_lesion",
    entity: "case_keloid_lesions",
    entityId: lesionId,
    detail: { direction, from: a.site_no, to: bb.site_no },
  });
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
      // 第一顆自動成為主病灶（JSS 評的那一顆）；多病灶時人員可在病灶清單改指定
      is_primary: nextSiteNo === 1,
      length_cm: lengthRaw ? Number(lengthRaw) : null,
      width_cm: widthRaw ? Number(widthRaw) : null,
      height_cm: heightRaw ? Number(heightRaw) : null,
      // 量測日：回診動線靠它分辨「這次量的」與「三個月前量的」（見 lib/visitFlow.ts）
      measured_at: lengthRaw || widthRaw || heightRaw ? todayInTaipei() : null,
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
      // 尺寸有動就重蓋量測日；整組清空時一併清掉，免得留下一個沒有值的量測日
      measured_at: lengthRaw || widthRaw || heightRaw ? todayInTaipei() : null,
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

/**
 * 指定主病灶（助理 2026-08-24）。JSS 疤痕診斷分類表只評「主要手術的那一顆」，
 * 12 題裡有 6 題是描述單一顆疤的，多病灶個案不指定就無法解讀那份量表。
 *
 * 一個個案只能有一顆：先把同個案的其他病灶取消，再設這一顆
 * （資料庫另有 partial unique index 兜底，見 migration 20260824020000）。
 */
export async function setPrimaryLesionAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const lesionId = formData.get("lesion_id") as string;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase.from("case_keloid_lesions").update({ is_primary: false }).eq("case_id", caseId).neq("id", lesionId);
  await supabase.from("case_keloid_lesions").update({ is_primary: true }).eq("id", lesionId);

  await logAudit({
    caseId,
    operatorName: operator,
    action: "set_primary_lesion",
    entity: "case_keloid_lesions",
    entityId: lesionId,
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

  const { data: removed } = await supabase
    .from("case_keloid_lesions")
    .select("is_primary")
    .eq("id", lesionId)
    .maybeSingle();

  await supabase.from("case_keloid_lesions").delete().eq("id", lesionId);

  // 刪掉的是主病灶時，把剩下編號最小的那顆補上——JSS 沒有主病灶就無從解讀
  if (removed?.is_primary) {
    const { data: next } = await supabase
      .from("case_keloid_lesions")
      .select("id")
      .eq("case_id", caseId)
      .order("site_no", { nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (next) await supabase.from("case_keloid_lesions").update({ is_primary: true }).eq("id", next.id);
  }

  await syncCaseBodySite(supabase, caseId);
  await logAudit({ caseId, operatorName: operator, action: "delete_keloid_lesion", entity: "case_keloid_lesions", entityId: lesionId });
  revalidatePath(`/cases/${caseId}`);
}

// ── LINE 綁定（2026-07-29）─────────────────────────────────────────────
// 平台只負責產生／清除綁定碼與顯示狀態；真正把 line_user_id 寫進來的是
// GAS 轉接層呼叫的 /api/line/message（病人在 LINE 送出綁定碼時）。

export async function generateLineBindCodeAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  // 綁定碼有唯一索引，理論上會撞（機率極低），撞到就重抽
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateBindCode();
    const expiresAt = new Date(Date.now() + BIND_CODE_TTL_HOURS * 3600_000).toISOString();
    const { error } = await supabase
      .from("cases")
      .update({ line_bind_code: code, line_bind_code_expires_at: expiresAt })
      .eq("id", caseId);
    if (!error) {
      await logAudit({ caseId, operatorName: operator, action: "generate_line_bind_code", entity: "cases", entityId: caseId });
      revalidatePath(`/cases/${caseId}`);
      return;
    }
    if (!String(error.message).includes("duplicate")) throw error;
  }
  throw new Error("產生綁定碼失敗，請再試一次");
}

/** 解除綁定：病人換手機、或綁錯人時使用。line_user_id 一併清掉，那支 LINE 才能重新綁。 */
export async function unbindLineAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase
    .from("cases")
    .update({ line_bound: false, line_user_id: null, line_bound_at: null, line_bind_code: null, line_bind_code_expires_at: null })
    .eq("id", caseId);

  await logAudit({ caseId, operatorName: operator, action: "line_unbind_by_staff", entity: "cases", entityId: caseId });
  revalidatePath(`/cases/${caseId}`);
}

// ── 追蹤時程的日期與提醒（2026-07-29）─────────────────────────────
// 時程項目的 due_date 原本是「建檔日 + 範本天數」算出來的，但真正的回診日由掛號決定，
// 兩者常差好幾天。沒有這支 action 的話，推出去的回診提醒日子會是錯的。

export async function updateScheduleItemDateAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const itemId = formData.get("item_id") as string;
  const dueDate = ((formData.get("due_date") as string) ?? "").trim();
  const remind = formData.get("remind") === "on";
  const operator = await operatorOrThrow();
  if (!caseId || !itemId || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return;

  const supabase = supabaseServer();
  const { data: item } = await supabase
    .from("case_schedule_items")
    .select("actions, due_date")
    .eq("id", itemId)
    .single();

  // 提醒與否跟日期在同一個表單，所以一起寫；actions 其餘動作（問卷／拍照）保持不動。
  const actions: string[] = (item?.actions ?? []).filter((a: string) => a !== "visit_reminder");
  if (remind) actions.push("visit_reminder");

  await supabase.from("case_schedule_items").update({ due_date: dueDate, actions }).eq("id", itemId);

  await logAudit({
    caseId,
    operatorName: operator,
    action: "update_schedule_item_date",
    entity: "case_schedule_items",
    entityId: itemId,
    detail: { from: item?.due_date ?? null, to: dueDate, remind },
  });
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/clinic-today");
}

/** 範本外的臨時回診（例：「兩週後回來看傷口」）。追蹤時程實務上很難完全照範本走。 */
export async function addScheduleItemAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const label = ((formData.get("label") as string) ?? "").trim() || "臨時回診";
  const dueDate = ((formData.get("due_date") as string) ?? "").trim();
  const remind = formData.get("remind") === "on";
  const operator = await operatorOrThrow();
  if (!caseId || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return;

  const supabase = supabaseServer();
  await supabase.from("case_schedule_items").insert({
    case_id: caseId,
    label,
    due_date: dueDate,
    status: "pending",
    actions: remind ? ["visit_reminder"] : [],
  });

  await logAudit({
    caseId,
    operatorName: operator,
    action: "add_schedule_item",
    entity: "case_schedule_items",
    detail: { label, dueDate, remind },
  });
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/clinic-today");
}

/**
 * 「此部位無法量測／無法拍照」的免除註記（2026-08-20，診間收案動線）。
 *
 * 動線在開 JSS 量表前會擋住沒量完長寬高、沒拍照的病灶。臨床上確實有量不到、
 * 病人拒絕拍照的情況，所以留這個逃生口——但它是一個**明確的動作＋原因**，
 * 不是「留空就算了」：留空跟「量了忘了存」在資料上長得一模一樣，事後分不出來。
 * 免除的同時往待補清單塞一筆（reason='waived'），下次回診看得到要補什麼。
 */
export async function setLesionWaiverAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const lesionId = formData.get("lesion_id") as string;
  const kind = formData.get("kind") as string; // "measure" | "photo"
  const waived = formData.get("waived") === "1";
  const reason = ((formData.get("reason") as string) ?? "").trim() || null;
  if (kind !== "measure" && kind !== "photo") return;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase
    .from("case_keloid_lesions")
    .update(
      kind === "measure"
        ? { measure_waived: waived, measure_waived_reason: waived ? reason : null }
        : { photo_waived: waived, photo_waived_reason: waived ? reason : null }
    )
    .eq("id", lesionId);

  const { data: lesion } = await supabase
    .from("case_keloid_lesions")
    .select("site_no, body_site")
    .eq("id", lesionId)
    .maybeSingle();
  const fieldKey = `lesion_${kind}_${lesionId}`;
  const label = `部位${lesion?.site_no ?? "?"} ${lesion?.body_site ?? ""}｜${kind === "measure" ? "長寬高未量測" : "未拍照"}`;

  if (waived) {
    await supabase
      .from("case_intake_followups")
      .upsert(
        { case_id: caseId, field_key: fieldKey, field_label: label, reason: "waived", patient_answer: reason, status: "pending" },
        { onConflict: "case_id,field_key" }
      );
  } else {
    await supabase.from("case_intake_followups").delete().eq("case_id", caseId).eq("field_key", fieldKey);
  }

  await logAudit({
    caseId,
    operatorName: operator,
    action: "set_lesion_waiver",
    entity: "case_keloid_lesions",
    entityId: lesionId,
    detail: { kind, waived, reason },
  });
  revalidatePath(`/cases/${caseId}`);
  revalidatePath(`/cases/${caseId}/clinic-flow`);
}
