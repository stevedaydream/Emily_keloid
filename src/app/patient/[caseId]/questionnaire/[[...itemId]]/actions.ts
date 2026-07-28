"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";
import { computeJSSClassification } from "@/lib/scoring";

export async function submitQuestionnaireAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const itemId = formData.get("item_id") as string;
  const questionnaireId = formData.get("questionnaire_id") as string;
  const operator = (await getCurrentOperator()) ?? "未知操作者";

  const supabase = supabaseServer();
  const { data: response, error } = await supabase
    .from("questionnaire_responses")
    .insert({ case_id: caseId, questionnaire_id: questionnaireId, schedule_item_id: itemId || null, submitted_via: "staff" })
    .select("id")
    .single();
  if (error || !response) throw error ?? new Error("送出問卷失敗");

  const [{ data: template }, { data: questions }] = await Promise.all([
    supabase.from("questionnaire_templates").select("name").eq("id", questionnaireId).single(),
    supabase.from("questionnaire_questions").select("id, order_no, question_type").eq("questionnaire_id", questionnaireId),
  ]);

  const answerRows = [];
  const answersByOrder: Record<number, unknown> = {};
  for (const q of questions ?? []) {
    if (q.question_type === "multi") {
      const values = formData.getAll(`q_${q.id}`) as string[];
      if (values.length > 0) answerRows.push({ response_id: response.id, question_id: q.id, answer_value: values });
    } else {
      const raw = formData.get(`q_${q.id}`);
      if (raw !== null && raw !== "") {
        // 量表評分題的選項 value 就是分數，跟 number 一樣存成數字（計分/匯出都當數值用）。
        const isNumeric = q.question_type === "number" || (q.question_type === "scale" && !Number.isNaN(Number(raw)));
        const value = isNumeric ? Number(raw) : raw;
        answerRows.push({ response_id: response.id, question_id: q.id, answer_value: value });
        answersByOrder[q.order_no] = value;
      }
    }
  }
  if (answerRows.length > 0) {
    await supabase.from("questionnaire_answers").insert(answerRows);
  }

  // JSS 疤痕診斷分類表送出後，直接把算出來的分數＋判定寫回個案基本資料的 JSW score 欄位，
  // 這樣「病人基本資料」區塊就不用再手動謄一次分數。
  if (template?.name === "JSS 疤痕診斷分類表") {
    const result = computeJSSClassification(answersByOrder);
    if (result) {
      await supabase.from("cases").update({ jsw_score: `${result.total} / 25` }).eq("id", caseId);
    }
  }

  await logAudit({ caseId, operatorName: operator, action: "submit_questionnaire", entity: "questionnaire_responses", entityId: response.id });

  redirect(`/cases/${caseId}?submitted=questionnaire`);
}
