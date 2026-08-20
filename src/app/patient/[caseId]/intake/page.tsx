import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import PatientIntakeFlow from "./PatientIntakeFlow";
import { SEGMENT_QUESTIONNAIRE_NAME, type PageableQuestion } from "@/lib/patientIntake";

// 病人自助填寫（決策 2026-07-29）。root layout 偵測到這個路徑就不渲染導覽列，
// 整頁是要交到病人手上的全螢幕介面。
export default async function PatientIntakePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const supabase = supabaseServer();

  const [{ data: caseRow }, { data: options }, { data: progress }, { data: templates }, { data: doctors }, { data: lesions }] =
    await Promise.all([
    supabase
      .from("cases")
      .select("id, research_id, sex, birth_date, age_at_enrollment, height_cm, weight_kg, phone_number, keloid_onset_date")
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
      }}
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
