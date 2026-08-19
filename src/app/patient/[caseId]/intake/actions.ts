"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";
import type { PatientIntakeSegmentKey } from "@/lib/patientIntake";
import QRCode from "qrcode";
import { generateBindCode, bindDeepLink, BIND_CODE_TTL_HOURS } from "@/lib/line";

// 病人自助填寫的寫入路徑（決策 2026-07-29）。
//
// 兩個貫穿全檔的原則：
//  1. **分段即時寫入**。門診現場很容易被打斷，最後才一次送出等於中途離開就全丟。
//  2. **答不出來的不留空，改成待補清單**。病人版沒有自由文字輸入，所以「答不知道」「答有
//     但細節問不到」「跳過」這三種情況各自留一筆 case_intake_followups 給人員追問。
//     答「無」是有效答案，不進清單。

type Prior = "yes" | "no" | "unknown";

const PRIOR_TEXT: Record<Prior, string> = { yes: "有", no: "無", unknown: "不知道" };

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
async function addFollowups(
  caseId: string,
  rows: { fieldKey: string; fieldLabel: string; reason: "unknown" | "no_detail" | "skipped"; patientAnswer?: string }[]
) {
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

/** 這一段重填時，先把上次留下、屬於這一段的待補項目清掉，避免舊的殘留。 */
async function clearFollowups(caseId: string, fieldKeys: string[]) {
  if (fieldKeys.length === 0) return;
  const supabase = supabaseServer();
  await supabase.from("case_intake_followups").delete().eq("case_id", caseId).in("field_key", fieldKeys);
}

export async function savePatientBasicAction(
  caseId: string,
  payload: { sex: string; birthYear: string | null; phone: string }
) {
  const supabase = supabaseServer();
  const operator = await operatorName();

  // 病人記得住的是出生年，不是「幾歲」——用出生年換算年齡再存，欄位本身不變。
  const age = payload.birthYear ? new Date().getFullYear() - Number(payload.birthYear) : null;

  const update: Record<string, string | number | null> = {};
  if (payload.sex) update.sex = payload.sex;
  if (age !== null && Number.isFinite(age) && age >= 0 && age <= 130) update.age_at_enrollment = age;
  if (payload.phone) update.phone_number = payload.phone;
  if (Object.keys(update).length > 0) await supabase.from("cases").update(update).eq("id", caseId);

  await clearFollowups(caseId, ["sex", "age", "phone"]);
  await addFollowups(caseId, [
    ...(payload.sex ? [] : [{ fieldKey: "sex", fieldLabel: "性別", reason: "skipped" as const }]),
    ...(age !== null ? [] : [{ fieldKey: "age", fieldLabel: "年齡／出生年", reason: "skipped" as const }]),
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
    visitReasonOptionIds: string[];
    onsetYear: string | null;
    priors: Record<string, Prior>;
    /** 這一段在本次填寫中先前建立的紀錄；病人按「上一步」回頭改後重存時用來取代，避免長出第二筆 */
    replaceRecordId?: string | null;
  }
): Promise<{ recordId: string | null }> {
  const supabase = supabaseServer();
  const operator = await operatorName();

  const update: Record<string, string | null> = {};
  if (!payload.familyHistoryUnknown) update.family_history = payload.familyHistory.join("、") || "無";
  // 只問到年份就好（月日長輩多半記不得），存成該年 1 月 1 日
  if (payload.onsetYear) update.keloid_onset_date = `${payload.onsetYear}-01-01`;
  for (const [key, value] of Object.entries(payload.priors)) update[key] = PRIOR_TEXT[value];
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

  const PRIOR_LABELS: Record<string, string> = {
    prior_steroid_treatment: "之前類固醇注射治療",
    prior_tcm_treatment: "之前中醫治療",
    prior_ogawa_patch: "之前小川令貼布使用史",
    prior_radiation_treatment: "之前放射線治療史",
  };
  const priorKeys = Object.keys(PRIOR_LABELS);
  await clearFollowups(caseId, [...priorKeys, "family_history", "keloid_onset_date", "keloid_history_detail"]);

  await addFollowups(caseId, [
    // 答「有」→ 病人版沒問日期/次數/劑量，人員要追；答「不知道」→ 也要追；答「無」不進清單
    ...Object.entries(payload.priors).flatMap(([key, value]) =>
      value === "no"
        ? []
        : [{ fieldKey: key, fieldLabel: PRIOR_LABELS[key] ?? key, reason: value === "yes" ? ("no_detail" as const) : ("unknown" as const), patientAnswer: PRIOR_TEXT[value] }]
    ),
    ...(payload.familyHistoryUnknown
      ? [{ fieldKey: "family_history", fieldLabel: "家族史", reason: "unknown" as const, patientAnswer: "不知道" }]
      : []),
    ...(payload.onsetYear
      ? []
      : [{ fieldKey: "keloid_onset_date", fieldLabel: "蟹足腫初次發生時間", reason: "unknown" as const, patientAnswer: "不記得" }]),
    // 原本這裡會依「病人勾了蟹足腫病史類型」推出一筆待補（提醒人員補部位/時間/治療方式）。
    // 2026-08-12 docx 項次 2 把那題換成「此次就診主要原因」後，這個推導不再成立，故移除。
    // 蟹足腫病史類型仍可由診間人員在個案頁記錄（category='keloid_history_type'），不受影響。
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
