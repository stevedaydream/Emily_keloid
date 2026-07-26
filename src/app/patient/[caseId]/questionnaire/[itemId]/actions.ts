"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";

export async function submitQuestionnaireAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const itemId = formData.get("item_id") as string;
  const questionnaireId = formData.get("questionnaire_id") as string;
  const operator = (await getCurrentOperator()) ?? "未知操作者";

  const supabase = supabaseServer();
  const { data: response, error } = await supabase
    .from("questionnaire_responses")
    .insert({ case_id: caseId, questionnaire_id: questionnaireId, schedule_item_id: itemId, submitted_via: "staff" })
    .select("id")
    .single();
  if (error || !response) throw error ?? new Error("送出問卷失敗");

  const { data: questions } = await supabase
    .from("questionnaire_questions")
    .select("id, question_type")
    .eq("questionnaire_id", questionnaireId);

  const answerRows = [];
  for (const q of questions ?? []) {
    if (q.question_type === "multi") {
      const values = formData.getAll(`q_${q.id}`) as string[];
      if (values.length > 0) answerRows.push({ response_id: response.id, question_id: q.id, answer_value: values });
    } else {
      const raw = formData.get(`q_${q.id}`);
      if (raw !== null && raw !== "") {
        const value = q.question_type === "number" ? Number(raw) : raw;
        answerRows.push({ response_id: response.id, question_id: q.id, answer_value: value });
      }
    }
  }
  if (answerRows.length > 0) {
    await supabase.from("questionnaire_answers").insert(answerRows);
  }

  await logAudit({ caseId, operatorName: operator, action: "submit_questionnaire", entity: "questionnaire_responses", entityId: response.id });

  redirect(`/patient/${caseId}/questionnaire/${itemId}/done`);
}
