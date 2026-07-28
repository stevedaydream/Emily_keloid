import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import PatientIntakeFlow from "./PatientIntakeFlow";
import { SEGMENT_QUESTIONNAIRE_NAME, type PageableQuestion } from "@/lib/patientIntake";

// 病人自助填寫（決策 2026-07-29）。root layout 偵測到這個路徑就不渲染導覽列，
// 整頁是要交到病人手上的全螢幕介面。
export default async function PatientIntakePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const supabase = supabaseServer();

  const [{ data: caseRow }, { data: options }, { data: progress }, { data: templates }] = await Promise.all([
    supabase.from("cases").select("id, research_id").eq("id", caseId).single(),
    supabase.from("case_intake_option_lists").select("id, category, label").eq("active", true).order("sort_order"),
    supabase.from("case_patient_intake_progress").select("segment_key").eq("case_id", caseId),
    supabase
      .from("questionnaire_templates")
      .select("id, name")
      .in("name", Object.values(SEGMENT_QUESTIONNAIRE_NAME) as string[]),
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
      completedSegments={(progress ?? []).map((p) => p.segment_key)}
      familyDiseaseOptions={optionsOf("family_disease")}
      keloidHistoryOptions={optionsOf("keloid_history_type")}
      onsetCauseOptions={optionsOf("onset_cause")}
      referralOptions={optionsOf("referral_source")}
      sf36={sf36 ? { id: sf36.id, name: sf36.name, questions: questionsFor(sf36.id) } : null}
      psqi={psqi ? { id: psqi.id, name: psqi.name, questions: questionsFor(psqi.id) } : null}
    />
  );
}
