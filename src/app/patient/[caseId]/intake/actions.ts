"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";
import type { PatientIntakeSegmentKey } from "@/lib/patientIntake";
import QRCode from "qrcode";
import { generateBindCode, bindDeepLink, BIND_CODE_TTL_HOURS } from "@/lib/line";
import { ageFromBirthDate } from "@/lib/dates";

// 病人自助填寫的寫入路徑（決策 2026-07-29）。
//
// 兩個貫穿全檔的原則：
//  1. **分段即時寫入**。門診現場很容易被打斷，最後才一次送出等於中途離開就全丟。
//  2. **答不出來的不留空，改成待補清單**。病人版沒有自由文字輸入，所以「答不知道」「答有
//     但細節問不到」「跳過」這三種情況各自留一筆 case_intake_followups 給人員追問。
//     答「無」是有效答案，不進清單。

type Prior = "yes" | "no" | "unknown";

const PRIOR_TEXT: Record<Prior, string> = { yes: "有", no: "無", unknown: "不知道" };

/** 四種過往治療的欄位與待補標籤。順序＝病人版逐題問的順序。 */
const PRIOR_LABELS: Record<string, string> = {
  prior_steroid_treatment: "之前類固醇注射治療",
  prior_tcm_treatment: "之前中醫治療",
  prior_ogawa_patch: "之前小川令貼布使用史",
  prior_radiation_treatment: "之前放射線治療史",
};
const PRIOR_KEYS = Object.keys(PRIOR_LABELS);

/**
 * 選單類問題（case_intake_option_records）的待補標籤（2026-08-24 補）。
 *
 * 這四題原本是整個病人版裡唯一沒有「答不出來就留一筆待補」的地方：跳過不寫紀錄，
 * 選「我不知道」則在送出前就被 filter 掉——兩者在資料上完全一樣，也沒有任何人被通知。
 * 個案頁那四區的勾選框長得跟沒填過一模一樣，看起來就像病人的答案掉了。
 */
const OPTION_FOLLOWUP_LABELS: Record<string, string> = {
  visit_reason: "此次就診主要原因",
  onset_cause: "發生原因",
  referral_source: "如何得知看診資訊",
  keloid_symptom: "目前不適症狀",
};

/** 兩份病人自評量表的待補鍵。逐題各留一筆會有五十幾筆，改成一份一筆、標題帶未答題數。 */
const QUESTIONNAIRE_FOLLOWUP_KEY: Partial<Record<PatientIntakeSegmentKey, string>> = {
  sf36: "questionnaire_sf36",
  psqi: "questionnaire_psqi",
};
const QUESTIONNAIRE_FOLLOWUP_LABEL: Partial<Record<PatientIntakeSegmentKey, string>> = {
  sf36: "SF-36 健康調查簡表",
  psqi: "匹茲堡睡眠品質量表（PSQI）",
};

async function operatorName() {
  // 病人自填時 operator cookie 仍是那位交出平板的人員——稽核要記得住負責的人，不是「病人」。
  return (await getCurrentOperator()) ?? "未知操作者";
}

async function markSegmentDone(caseId: string, segment: PatientIntakeSegmentKey) {
  const supabase = supabaseServer();
  await supabase
    .from("case_patient_intake_progress")
    .upsert(
      { case_id: caseId, segment_key: segment, status: "done", completed_at: new Date().toISOString(), filled_via: "patient" },
      { onConflict: "case_id,segment_key" }
    );
}

/** reason: unknown=答不知道 / no_detail=答有但沒問細節 / skipped=跳過沒答 */
type FollowupRow = {
  fieldKey: string;
  fieldLabel: string;
  reason: "unknown" | "no_detail" | "skipped";
  patientAnswer?: string;
};

async function addFollowups(caseId: string, rows: FollowupRow[]) {
  if (rows.length === 0) return;
  const supabase = supabaseServer();
  await supabase.from("case_intake_followups").upsert(
    rows.map((r) => ({
      case_id: caseId,
      field_key: r.fieldKey,
      field_label: r.fieldLabel,
      reason: r.reason,
      patient_answer: r.patientAnswer ?? null,
      status: "pending",
    })),
    { onConflict: "case_id,field_key" }
  );
}

/**
 * 選單類問題答不出來時的待補（2026-08-24）。有勾任何一項就是有效答案，不進清單；
 * 選「我不知道」與整題跳過都要留一筆，但理由分開——前者是問過了、後者是根本沒答。
 */
function optionFollowups(category: string, optionIds: string[], unknown: boolean): FollowupRow[] {
  if (optionIds.length > 0) return [];
  const fieldLabel = OPTION_FOLLOWUP_LABELS[category] ?? category;
  return unknown
    ? [{ fieldKey: category, fieldLabel, reason: "unknown", patientAnswer: "不知道" }]
    : [{ fieldKey: category, fieldLabel, reason: "skipped" }];
}

/** 這一段重填時，先把上次留下、屬於這一段的待補項目清掉，避免舊的殘留。 */
async function clearFollowups(caseId: string, fieldKeys: string[]) {
  if (fieldKeys.length === 0) return;
  const supabase = supabaseServer();
  await supabase.from("case_intake_followups").delete().eq("case_id", caseId).in("field_key", fieldKeys);
}

export async function savePatientBasicAction(
  caseId: string,
  payload: { sex: string; birthDate: string | null; height: string | null; weight: string | null; phone: string }
) {
  const supabase = supabaseServer();
  const operator = await operatorName();

  // 2026-08-20：改收精確出生日期（原本只收出生年）。birth_date 進 cases，
  // age_at_enrollment 仍照樣算出來存——匯出檔與既有分析都吃這個欄位。
  const age = payload.birthDate ? ageFromBirthDate(payload.birthDate) : null;
  // 身高體重是履帶選的整數，這裡仍做一次範圍檢查：資料庫欄位是 numeric，寫進髒值日後很難查。
  const num = (raw: string | null, lo: number, hi: number): number | null => {
    if (!raw) return null;
    const v = Number(raw);
    return Number.isFinite(v) && v >= lo && v <= hi ? v : null;
  };
  const height = num(payload.height, 50, 250);
  const weight = num(payload.weight, 10, 300);

  const update: Record<string, string | number | null> = {};
  if (payload.sex) update.sex = payload.sex;
  if (payload.birthDate && age !== null) update.birth_date = payload.birthDate;
  if (age !== null) update.age_at_enrollment = age;
  if (height !== null) update.height_cm = height;
  if (weight !== null) update.weight_kg = weight;
  if (payload.phone) update.phone_number = payload.phone;
  if (Object.keys(update).length > 0) await supabase.from("cases").update(update).eq("id", caseId);

  await clearFollowups(caseId, ["sex", "age", "height", "weight", "phone"]);
  await addFollowups(caseId, [
    ...(payload.sex ? [] : [{ fieldKey: "sex", fieldLabel: "性別", reason: "skipped" as const }]),
    ...(age !== null ? [] : [{ fieldKey: "age", fieldLabel: "出生日期", reason: "skipped" as const }]),
    ...(height !== null ? [] : [{ fieldKey: "height", fieldLabel: "身高", reason: "skipped" as const }]),
    ...(weight !== null ? [] : [{ fieldKey: "weight", fieldLabel: "體重", reason: "skipped" as const }]),
    ...(payload.phone ? [] : [{ fieldKey: "phone", fieldLabel: "手機號碼", reason: "skipped" as const }]),
  ]);

  await markSegmentDone(caseId, "basic");
  await logAudit({ caseId, operatorName: operator, action: "patient_self_entry", entity: "cases", detail: { segment: "basic" } });
  revalidatePath(`/cases/${caseId}`);
}

export async function savePatientHistoryAction(
  caseId: string,
  payload: {
    familyHistory: string[];
    familyHistoryUnknown: boolean;
    /** 病人明確選了「以上都沒有」。跟「整題跳過」不同：後者不該被寫成「無」（2026-08-24） */
    familyHistoryNone: boolean;
    visitReasonOptionIds: string[];
    /** 病人選了「我不知道」。跟跳過一樣不會產生紀錄，但要留下不同的待補理由 */
    visitReasonUnknown: boolean;
    onsetYear: string | null;
    /** 「以前有沒有為蟹足腫治療過」的總開關。答無／不記得時，四個細項不再逐題問（見下方） */
    priorTreated: Prior | "";
    /** 治療過的話是哪一位醫師（選項的標籤文字，可能是「其他醫院／診所」「不記得」） */
    priorTreatmentPhysician: string | null;
    priors: Record<string, Prior>;
    /** 這一段在本次填寫中先前建立的紀錄；病人按「上一步」回頭改後重存時用來取代，避免長出第二筆 */
    replaceRecordId?: string | null;
  }
): Promise<{ recordId: string | null }> {
  const supabase = supabaseServer();
  const operator = await operatorName();

  const update: Record<string, string | null> = {};
  // 家族史三種結局要分得開（2026-08-24）：
  //   勾了病名 → 寫病名 ／ 勾「以上都沒有」→ 寫「無」 ／ 跳過或答不知道 → 不寫欄位，留待補。
  // 原本是 `join("、") || "無"`，於是「整題跳過」也會被寫成「無」——那是憑空生出來的陰性結果，
  // 家族史又正好是蟹足腫最重要的體質線索之一。
  if (payload.familyHistory.length > 0) update.family_history = payload.familyHistory.join("、");
  else if (payload.familyHistoryNone) update.family_history = "無";
  // 只問到年份就好（月日長輩多半記不得），存成該年 1 月 1 日
  if (payload.onsetYear) update.keloid_onset_date = `${payload.onsetYear}-01-01`;

  // 治療史的總開關（2026-08-20 使用者要求）：答「沒有治療過」就不必再逐題問類固醇／中醫／
  // 貼布／放射線——那四題的答案已經被決定了。這個推導放在伺服器端而不是讓畫面補齊，
  // 是因為「病人跳過那四題」跟「病人答無」在 payload 上長得一樣，只有這裡分得出來。
  //
  // ⚠️ 2026-08-24：`priorTreated` 沒答（病人跳過那一頁）時走的是最後這條分支，而那四題的畫面
  // 根本沒出現過，所以 payload.priors 是空物件——底下的迴圈不跑、欄位不寫，連一筆待補都不會產。
  // 治療史整組靜悄悄地消失。答「有治療過」但四個細項跳過也是同一個洞。
  // 欄位維持不寫（沒有答案就不該編一個），改成在下面的 addFollowups 補上 `skipped`。
  const effectivePriors: Record<string, Prior> =
    payload.priorTreated === "no"
      ? Object.fromEntries(PRIOR_KEYS.map((k) => [k, "no" as Prior]))
      : payload.priorTreated === "unknown"
      ? Object.fromEntries(PRIOR_KEYS.map((k) => [k, "unknown" as Prior]))
      : payload.priors;

  for (const [key, value] of Object.entries(effectivePriors)) update[key] = PRIOR_TEXT[value];
  if (payload.priorTreatmentPhysician) update.prior_treatment_physician = payload.priorTreatmentPhysician;
  await supabase.from("cases").update(update).eq("id", caseId);

  // 此次就診主要原因走 case_intake_option_records（逐筆累加，不會蓋掉人員填的）。
  // 2026-08-12 docx 項次 2：原本這題問的是 keloid_history_type（「您的蟹足腫是怎麼來的？」），
  // 已整組換成 visit_reason（「您此次至本院就診的主要原因為何？」，2026-08-14 改採新版碼表後為 6 選項）。
  // 本次填寫如果已經建過一筆（病人按「上一步」回頭改），先刪掉那一筆再重建，
  // 否則同一次收案會留下兩筆互相矛盾的紀錄。items 有 on delete cascade。
  if (payload.replaceRecordId) {
    await supabase.from("case_intake_option_records").delete().eq("id", payload.replaceRecordId);
  }
  let recordId: string | null = null;
  if (payload.visitReasonOptionIds.length > 0) {
    const { data: record } = await supabase
      .from("case_intake_option_records")
      .insert({ case_id: caseId, category: "visit_reason", recorded_by: `${operator}（病人自填）`, notes: null })
      .select("id")
      .single();
    if (record) {
      recordId = record.id;
      await supabase
        .from("case_intake_option_record_items")
        .insert(payload.visitReasonOptionIds.map((optionId) => ({ record_id: record.id, option_id: optionId })));
    }
  }

  await clearFollowups(caseId, [
    ...PRIOR_KEYS,
    "family_history",
    "keloid_onset_date",
    "keloid_history_detail",
    "prior_treatment_physician",
    "visit_reason",
  ]);

  await addFollowups(caseId, [
    // 答「有」→ 病人版沒問日期/次數/劑量，人員要追；答「不知道」→ 也要追；答「無」不進清單。
    // 沒有答案（跳過總開關、或答「有」但細項沒答）→ skipped，同樣要有人去問。
    ...PRIOR_KEYS.flatMap((key): FollowupRow[] => {
      const value = effectivePriors[key];
      const fieldLabel = PRIOR_LABELS[key] ?? key;
      if (value === "no") return [];
      if (value === undefined) return [{ fieldKey: key, fieldLabel, reason: "skipped" }];
      return [
        {
          fieldKey: key,
          fieldLabel,
          reason: value === "yes" ? ("no_detail" as const) : ("unknown" as const),
          patientAnswer: PRIOR_TEXT[value],
        },
      ];
    }),
    ...(payload.familyHistoryUnknown
      ? [{ fieldKey: "family_history", fieldLabel: "家族史", reason: "unknown" as const, patientAnswer: "不知道" }]
      : []),
    // 跳過（沒勾病名、也沒勾「以上都沒有」）
    ...(!payload.familyHistoryUnknown && payload.familyHistory.length === 0 && !payload.familyHistoryNone
      ? [{ fieldKey: "family_history", fieldLabel: "家族史", reason: "skipped" as const }]
      : []),
    ...optionFollowups("visit_reason", payload.visitReasonOptionIds, payload.visitReasonUnknown),
    ...(payload.onsetYear
      ? []
      : [{ fieldKey: "keloid_onset_date", fieldLabel: "蟹足腫初次發生時間", reason: "unknown" as const, patientAnswer: "不記得" }]),
    // 治療過但說不出是哪位醫師：人員要回頭查。答「沒有治療過」就不需要這一筆。
    ...(payload.priorTreated === "yes" && !payload.priorTreatmentPhysician
      ? [{ fieldKey: "prior_treatment_physician", fieldLabel: "之前治療的醫師", reason: "unknown" as const, patientAnswer: "不記得" }]
      : []),
    // 原本這裡會依「病人勾了蟹足腫病史類型」推出一筆待補（提醒人員補部位/時間/治療方式）。
    // 2026-08-12 docx 項次 2 把那題換成「此次就診主要原因」後，這個推導不再成立，故移除。
    // 蟹足腫病史類型（keloid_history_type）已於 2026-08-25 整個移除——匯出沒有對應欄位、
    // 語意又與「發生原因 (KC)」重疊，留著只會讓人以為是回填壞了。
  ]);

  await markSegmentDone(caseId, "history");
  await logAudit({ caseId, operatorName: operator, action: "patient_self_entry", entity: "cases", detail: { segment: "history" } });
  revalidatePath(`/cases/${caseId}`);
  return { recordId };
}

export async function savePatientIntakeOptionsAction(
  caseId: string,
  payload: {
    onsetCauseIds: string[];
    referralIds: string[];
    /** 目前不適症狀（keloid_symptom）。純主觀症狀，只有病人答得準，2026-08-20 移進病人版。 */
    symptomIds: string[];
    /** 各題「我不知道」的旗標。症狀題沒有這個選項（不會不舒服要選「無明顯不適」），故只有兩個 */
    onsetCauseUnknown: boolean;
    referralUnknown: boolean;
    /** 同 savePatientHistoryAction：回頭改後重存時取代本次先前建立的紀錄 */
    replaceRecordIds?: (string | null)[];
  }
): Promise<{ recordIds: (string | null)[] }> {
  const supabase = supabaseServer();
  const operator = await operatorName();

  const toReplace = (payload.replaceRecordIds ?? []).filter((v): v is string => Boolean(v));
  if (toReplace.length > 0) {
    await supabase.from("case_intake_option_records").delete().in("id", toReplace);
  }

  const recordIds: (string | null)[] = [];
  for (const [category, optionIds] of [
    ["onset_cause", payload.onsetCauseIds],
    ["referral_source", payload.referralIds],
    ["keloid_symptom", payload.symptomIds],
  ] as const) {
    if (optionIds.length === 0) {
      recordIds.push(null);
      continue;
    }
    const { data: record } = await supabase
      .from("case_intake_option_records")
      .insert({ case_id: caseId, category, recorded_by: `${operator}（病人自填）`, notes: null })
      .select("id")
      .single();
    recordIds.push(record?.id ?? null);
    if (record) {
      await supabase
        .from("case_intake_option_record_items")
        .insert(optionIds.map((optionId) => ({ record_id: record.id, option_id: optionId })));
    }
  }

  await clearFollowups(caseId, ["onset_cause", "referral_source", "keloid_symptom"]);
  await addFollowups(caseId, [
    ...optionFollowups("onset_cause", payload.onsetCauseIds, payload.onsetCauseUnknown),
    ...optionFollowups("referral_source", payload.referralIds, payload.referralUnknown),
    // 症狀題沒有「我不知道」，空的就是整題跳過
    ...optionFollowups("keloid_symptom", payload.symptomIds, false),
  ]);

  await markSegmentDone(caseId, "intake_options");
  await logAudit({
    caseId,
    operatorName: operator,
    action: "patient_self_entry",
    entity: "case_intake_option_records",
    detail: { segment: "intake_options" },
  });
  revalidatePath(`/cases/${caseId}`);
  return { recordIds };
}

export async function savePatientQuestionnaireAction(
  caseId: string,
  segment: PatientIntakeSegmentKey,
  payload: {
    questionnaireId: string;
    answers: Record<string, string | string[]>;
    /**
     * 這次流程實際顯示給病人看過的題目 id。用來算「該答而沒答」的題數——
     * 不能直接拿問卷總題數扣，PSQI 有幾題是刻意不問的（5j／11e 的文字說明），
     * 答「沒有睡伴或室友」時第 11 題那四小題也整組不出現，那些不算漏答。
     */
    presentedQuestionIds: string[];
    /** 本次填寫先前送出的那一筆回覆；病人回頭改答案後重存時取代它，不要留下兩份同一份問卷的回覆。
     *  只刪本次自己建立的那一筆，歷史回覆（例如上次回診填的）不受影響。 */
    replaceResponseId?: string | null;
  }
): Promise<{ responseId: string }> {
  const supabase = supabaseServer();
  const operator = await operatorName();

  if (payload.replaceResponseId) {
    // questionnaire_answers.response_id 是 on delete cascade，答案會跟著刪掉
    await supabase.from("questionnaire_responses").delete().eq("id", payload.replaceResponseId);
  }

  const { data: response, error } = await supabase
    .from("questionnaire_responses")
    // submitted_via='patient'：跟人員代填（'staff'）區分開，之後分析才知道是誰答的
    .insert({ case_id: caseId, questionnaire_id: payload.questionnaireId, submitted_via: "patient" })
    .select("id")
    .single();
  if (error || !response) throw error ?? new Error("送出問卷失敗");

  const { data: questions } = await supabase
    .from("questionnaire_questions")
    .select("id, question_type")
    .eq("questionnaire_id", payload.questionnaireId);

  const rows = [];
  for (const q of questions ?? []) {
    const raw = payload.answers[q.id];
    if (raw === undefined || raw === "" || (Array.isArray(raw) && raw.length === 0)) continue;
    if (Array.isArray(raw)) {
      rows.push({ response_id: response.id, question_id: q.id, answer_value: raw });
    } else {
      // 量表題的選項 value 就是分數，跟 number 一樣存成數字（計分與匯出都當數值用）
      const isNumeric = q.question_type === "number" || (q.question_type === "scale" && !Number.isNaN(Number(raw)));
      rows.push({ response_id: response.id, question_id: q.id, answer_value: isNumeric ? Number(raw) : raw });
    }
  }
  if (rows.length > 0) await supabase.from("questionnaire_answers").insert(rows);

  // 漏答的題目要有人知道（2026-08-24）。逐題各留一筆會有五十幾筆待補把清單灌爆，
  // 所以一份問卷只留一筆、標題帶未答題數；人員點進去重填即可。
  const followupKey = QUESTIONNAIRE_FOLLOWUP_KEY[segment];
  if (followupKey) {
    const answered = new Set(rows.map((r) => r.question_id));
    const missing = payload.presentedQuestionIds.filter((qid) => !answered.has(qid)).length;
    await clearFollowups(caseId, [followupKey]);
    if (missing > 0) {
      await addFollowups(caseId, [
        {
          fieldKey: followupKey,
          fieldLabel: `${QUESTIONNAIRE_FOLLOWUP_LABEL[segment] ?? segment}（${missing} 題未作答）`,
          reason: "skipped",
        },
      ]);
    }
  }

  await markSegmentDone(caseId, segment);
  await logAudit({
    caseId,
    operatorName: operator,
    action: "patient_self_entry",
    entity: "questionnaire_responses",
    entityId: response.id,
    detail: { segment, answered: rows.length },
  });
  revalidatePath(`/cases/${caseId}`);
  return { responseId: response.id };
}

/** 人員在個案頁把待補項目處理掉。 */
export async function resolveFollowupAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const followupId = formData.get("followup_id") as string;
  const staffNote = ((formData.get("staff_note") as string) || "").trim() || null;
  const operator = await operatorName();
  const supabase = supabaseServer();

  await supabase
    .from("case_intake_followups")
    .update({ status: "resolved", staff_note: staffNote, resolved_by: operator, resolved_at: new Date().toISOString() })
    .eq("id", followupId);

  await logAudit({ caseId, operatorName: operator, action: "resolve_intake_followup", entity: "case_intake_followups", entityId: followupId });
  revalidatePath(`/cases/${caseId}`);
}

// 填完那一頁順手綁 LINE（2026-07-29 使用者要求）：病人的手機就在手上、人也還在，
// 是整個流程裡最容易完成綁定的時機。
//
// 刻意做成「按鈕觸發的 action」而不是在頁面渲染時就備好 QR：
// 產生綁定碼是對 cases 的寫入，不該是 GET 的副作用（Next 可能重複渲染、也可能被預取）。
export async function patientBindQrAction(caseId: string): Promise<
  | { state: "bound" }
  | { state: "ready"; code: string; qrDataUrl: string | null }
  | { state: "error"; message: string }
> {
  const supabase = supabaseServer();

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, line_bound, line_bind_code, line_bind_code_expires_at")
    .eq("id", caseId)
    .maybeSingle();
  if (!caseRow) return { state: "error", message: "找不到個案" };
  if (caseRow.line_bound) return { state: "bound" };

  const stillValid =
    caseRow.line_bind_code &&
    caseRow.line_bind_code_expires_at &&
    new Date(caseRow.line_bind_code_expires_at) > new Date();

  let code = stillValid ? (caseRow.line_bind_code as string) : "";
  if (!code) {
    for (let attempt = 0; attempt < 5 && !code; attempt++) {
      const candidate = generateBindCode();
      const { error } = await supabase
        .from("cases")
        .update({
          line_bind_code: candidate,
          line_bind_code_expires_at: new Date(Date.now() + BIND_CODE_TTL_HOURS * 3600_000).toISOString(),
        })
        .eq("id", caseId);
      if (!error) code = candidate;
      else if (!String(error.message).includes("duplicate")) {
        return { state: "error", message: "產生綁定碼失敗" };
      }
    }
    if (!code) return { state: "error", message: "產生綁定碼失敗，請洽診間人員" };

    await logAudit({
      caseId,
      operatorName: `${(await getCurrentOperator()) ?? "未知操作者"}（病人自填頁）`,
      action: "generate_line_bind_code",
      entity: "cases",
      entityId: caseId,
    });
  }

  const link = bindDeepLink(code, process.env.LINE_OA_BASIC_ID);
  const qrDataUrl = link ? await QRCode.toDataURL(link, { width: 320, margin: 1, errorCorrectionLevel: "M" }) : null;
  return { state: "ready", code, qrDataUrl };
}
