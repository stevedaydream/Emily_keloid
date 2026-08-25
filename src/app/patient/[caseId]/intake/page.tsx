import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import PatientIntakeFlow from "./PatientIntakeFlow";
import { SEGMENT_QUESTIONNAIRE_NAME, FOLLOWUP_SEGMENT, type PageableQuestion } from "@/lib/patientIntake";

// 病人自助填寫（決策 2026-07-29）。root layout 偵測到這個路徑就不渲染導覽列，
// 整頁是要交到病人手上的全螢幕介面。
export default async function PatientIntakePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const supabase = supabaseServer();

  const [
    { data: caseRow },
    { data: options },
    { data: progress },
    { data: templates },
    { data: doctors },
    { data: lesions },
    { data: optionRecords },
    { data: followups },
  ] = await Promise.all([
    supabase
      .from("cases")
      // 2026-08-25：回頭檢視要把已經答過的都帶回畫面上，所以病史那幾欄也要撈。
      // ⚠️ select 字串必須是單一字面值——用 + 串起來會讓 supabase-js 推不出回傳型別，
      // caseRow 會整個變成 GenericStringError。
      .select(
        "id, research_id, sex, birth_date, age_at_enrollment, height_cm, weight_kg, phone_number, keloid_onset_date, family_history, prior_treatment_physician, prior_steroid_treatment, prior_tcm_treatment, prior_ogawa_patch, prior_radiation_treatment"
      )
      .eq("id", caseId)
      .single(),
    supabase.from("case_intake_option_lists").select("id, category, label").eq("active", true).order("sort_order"),
    supabase.from("case_patient_intake_progress").select("segment_key").eq("case_id", caseId),
    supabase
      .from("questionnaire_templates")
      .select("id, name")
      .in("name", Object.values(SEGMENT_QUESTIONNAIRE_NAME) as string[]),
    supabase.from("doctors").select("id, name").eq("active", true).order("code"),
    // 完成畫面要提醒「這位還沒量病灶，別讓他走」——只需要知道有沒有，不必抓內容
    supabase.from("case_keloid_lesions").select("id").eq("case_id", caseId).limit(1),
    // 選單類的既有作答：每一類取最新一筆（這幾類是 append-only 的歷史，最新一筆＝現況）
    supabase
      .from("case_intake_option_records")
      .select("id, category, recorded_at, case_intake_option_record_items(option_id)")
      .eq("case_id", caseId)
      .order("recorded_at", { ascending: false }),
    // 「哪幾題沒答」不必重算——存檔當下就寫進待補清單了
    supabase.from("case_intake_followups").select("field_key, field_label, reason, status").eq("case_id", caseId),
  ]);

  if (!caseRow) return notFound();

  const templateIds = (templates ?? []).map((t) => t.id);
  const { data: questions } = templateIds.length
    ? await supabase
        .from("questionnaire_questions")
        .select("id, questionnaire_id, order_no, question_text, question_type, options, required")
        .in("questionnaire_id", templateIds)
        .order("order_no")
    : { data: [] };

  const byName = (name: string) => (templates ?? []).find((t) => t.name === name);
  const questionsFor = (templateId: string | undefined): PageableQuestion[] =>
    templateId
      ? (questions ?? [])
          .filter((q) => q.questionnaire_id === templateId)
          .map((q) => ({
            id: q.id,
            order_no: q.order_no,
            question_text: q.question_text,
            question_type: q.question_type,
            options: (q.options ?? []) as { value: string; label: string }[],
            required: q.required,
          }))
      : [];

  const sf36 = byName(SEGMENT_QUESTIONNAIRE_NAME.sf36!);
  const psqi = byName(SEGMENT_QUESTIONNAIRE_NAME.psqi!);
  const optionsOf = (category: string) => (options ?? []).filter((o) => o.category === category);

  // ── 回頭檢視用的既有作答（2026-08-25）──────────────────────────
  // 填完之後再點「重新填寫」，畫面要帶著上次的答案，而不是從一片空白重來：
  // 空白畫面往前走一次，每跨一段就把空的答案存回去，等於把資料洗掉。

  /** 該類最新一筆紀錄勾了哪些 option（記錄依 recorded_at 由新到舊排序） */
  const latestOptionIds = (category: string): string[] => {
    const latest = (optionRecords ?? []).find((r) => r.category === category);
    return ((latest?.case_intake_option_record_items ?? []) as { option_id?: string | null }[])
      .map((it) => it.option_id)
      .filter((v): v is string => Boolean(v));
  };

  // 家族史存的是「、」串起來的病名文字，反查回 option id；「無」是有效答案（＝以上都沒有）
  const familyLabels = String(caseRow.family_history ?? "")
    .split("、")
    .map((s) => s.trim())
    .filter(Boolean);
  const familyOptionIds = optionsOf("family_disease")
    .filter((o) => familyLabels.includes(o.label))
    .map((o) => o.id);

  // 過往治療：四個欄位存的是「有／無／不知道」，反推回病人版的總開關與逐題答案。
  // 四題全是「無」＝當初答了「沒有治療過」；全是「不知道」＝答了「不記得」；
  // 其餘只要有值就是逐題答過（總開關＝有治療過）。
  const PRIOR_KEYS = [
    "prior_steroid_treatment",
    "prior_tcm_treatment",
    "prior_ogawa_patch",
    "prior_radiation_treatment",
  ] as const;
  const priorText: Record<string, "yes" | "no" | "unknown"> = { 有: "yes", 無: "no", 不知道: "unknown" };
  const priors: Record<string, "yes" | "no" | "unknown"> = {};
  for (const k of PRIOR_KEYS) {
    const v = priorText[(caseRow[k] as string) ?? ""];
    if (v) priors[k] = v;
  }
  const priorValues = PRIOR_KEYS.map((k) => priors[k]);
  const priorTreated: "yes" | "no" | "unknown" | "" =
    priorValues.every((v) => v === "no")
      ? "no"
      : priorValues.every((v) => v === "unknown")
      ? "unknown"
      : priorValues.some(Boolean)
      ? "yes"
      : "";

  // 兩份量表的最新一筆回覆＋逐題答案。回頭重填時取代它，不要多長出一筆 Baseline——
  // 匯出的「問卷分數」是一列＝一個人×一個時間點，同一個時間點兩筆會打架。
  const scaleIds = [sf36?.id, psqi?.id].filter((v): v is string => Boolean(v));
  const { data: responses } = scaleIds.length
    ? await supabase
        .from("questionnaire_responses")
        .select("id, questionnaire_id, submitted_at, questionnaire_answers(question_id, answer_value)")
        .eq("case_id", caseId)
        .in("questionnaire_id", scaleIds)
        .order("submitted_at", { ascending: false })
    : { data: [] };

  const answersOf = (templateId: string | undefined) => {
    if (!templateId) return { responseId: null as string | null, answers: {} as Record<string, string | string[]> };
    const latest = (responses ?? []).find((r) => r.questionnaire_id === templateId);
    if (!latest) return { responseId: null, answers: {} };
    const answers: Record<string, string | string[]> = {};
    for (const a of (latest.questionnaire_answers ?? []) as { question_id: string; answer_value: unknown }[]) {
      // answer_value 是 jsonb：複選存陣列、量表題存數字、其餘存字串，畫面一律吃字串
      if (Array.isArray(a.answer_value)) answers[a.question_id] = a.answer_value.map(String);
      else if (a.answer_value !== null && a.answer_value !== undefined) answers[a.question_id] = String(a.answer_value);
    }
    return { responseId: latest.id as string, answers };
  };
  const sf36Prev = answersOf(sf36?.id);
  const psqiPrev = answersOf(psqi?.id);

  // 「哪幾題沒答」：待補清單裡還沒被人員處理掉的那些，依段落分組給畫面用
  const unresolved = (followups ?? []).filter((f) => f.status === "pending");
  const unknownReason = (fieldKey: string) =>
    unresolved.some((f) => f.field_key === fieldKey && f.reason === "unknown");

  return (
    <PatientIntakeFlow
      caseId={caseId}
      researchId={caseRow.research_id}
      // 建檔時診間已經填過的資料先帶進來，病人不用重複回答（2026-08-12 使用者要求）。
      // 出生日期只認 birth_date：2026-08-20 起病人自填的是精確日期，
      // 拿 age_at_enrollment 反推會生出一個假的月日蓋掉真的（回溯建檔的個案只有年齡沒有生日）。
      prefill={{
        sex: caseRow.sex ?? "",
        birthDate: caseRow.birth_date ?? "",
        height: caseRow.height_cm != null ? String(caseRow.height_cm) : "",
        weight: caseRow.weight_kg != null ? String(caseRow.weight_kg) : "",
        phone: caseRow.phone_number ?? "",
        onsetYear: caseRow.keloid_onset_date ? String(new Date(caseRow.keloid_onset_date).getFullYear()) : "",
        // 2026-08-25：以下是「已經填過的」，回頭檢視時要原樣帶回畫面
        familyOptionIds,
        familyNone: (caseRow.family_history ?? "").trim() === "無",
        familyUnknown: unknownReason("family_history"),
        visitReasonIds: latestOptionIds("visit_reason"),
        visitReasonUnknown: unknownReason("visit_reason"),
        onsetCauseIds: latestOptionIds("onset_cause"),
        onsetCauseUnknown: unknownReason("onset_cause"),
        referralIds: latestOptionIds("referral_source"),
        referralUnknown: unknownReason("referral_source"),
        symptomIds: latestOptionIds("keloid_symptom"),
        priorTreated,
        priorDoctor: caseRow.prior_treatment_physician ?? "",
        priors,
        sf36: sf36Prev,
        psqi: psqiPrev,
      }}
      // 每一段還有哪幾題沒答（存檔當下算好的待補清單），回頭檢視的入口畫面要標出來
      pendingBySegment={unresolved
        .filter((f) => FOLLOWUP_SEGMENT[f.field_key])
        .map((f) => ({ segment: FOLLOWUP_SEGMENT[f.field_key], label: f.field_label, reason: f.reason }))}
      // 台北時區的今天：伺服器跑 UTC，直接 new Date() 早上八點前會少一天
      birthDateMax={new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date())}
      completedSegments={(progress ?? []).map((p) => p.segment_key)}
      familyDiseaseOptions={optionsOf("family_disease")}
      visitReasonOptions={optionsOf("visit_reason")}
      onsetCauseOptions={optionsOf("onset_cause")}
      referralOptions={optionsOf("referral_source")}
      symptomOptions={optionsOf("keloid_symptom")}
      priorDoctorOptions={(doctors ?? []).map((d) => ({ id: d.id, label: d.name }))}
      hasLesions={(lesions ?? []).length > 0}
      sf36={sf36 ? { id: sf36.id, name: sf36.name, questions: questionsFor(sf36.id) } : null}
      psqi={psqi ? { id: psqi.id, name: psqi.name, questions: questionsFor(psqi.id) } : null}
    />
  );
}
