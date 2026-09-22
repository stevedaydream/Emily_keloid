"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { isSystemQuestionnaire } from "@/lib/questionnaireSystem";

type Option = { value: string; label: string };

// options 輸入格式：一行一個選項，格式 value|label
function parseOptions(raw: string | null | undefined): Option[] {
  const text = raw?.trim();
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, label] = line.split("|");
      return { value: value?.trim(), label: (label ?? value)?.trim() };
    });
}

export async function createQuestionnaireAction(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const category = formData.get("category") as string;
  const description = (formData.get("description") as string)?.trim() || null;
  if (!name) return;

  const supabase = supabaseServer();
  const { data } = await supabase
    .from("questionnaire_templates")
    .insert({ name, category, description })
    .select("id")
    .single();

  revalidatePath("/admin/questionnaires");
  if (data) redirect(`/admin/questionnaires/${data.id}`);
}

// 「正式上線需填寫」：勾了的問卷會出現在每個個案頁面的「應填問卷清單」並追蹤完成與否。
// 跟 active 是兩件事：active 決定這份問卷還能不能被使用，這裡決定它是不是每案必填。
export async function toggleQuestionnaireRequiredAction(formData: FormData) {
  const id = formData.get("id") as string;
  const required = formData.get("required_for_intake") === "true";
  const supabase = supabaseServer();
  await supabase.from("questionnaire_templates").update({ required_for_intake: !required }).eq("id", id);
  revalidatePath("/admin/questionnaires");
  revalidatePath("/cases", "layout");
}

export async function toggleQuestionnaireActiveAction(formData: FormData) {
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  const supabase = supabaseServer();
  await supabase.from("questionnaire_templates").update({ active: !active }).eq("id", id);
  revalidatePath("/admin/questionnaires");
  revalidatePath("/cases", "layout");
}

export async function addQuestionAction(formData: FormData) {
  const questionnaireId = formData.get("questionnaire_id") as string;
  const questionText = (formData.get("question_text") as string)?.trim();
  const questionType = formData.get("question_type") as string;
  const options = parseOptions(formData.get("options") as string);
  const required = formData.get("required") === "on";
  if (!questionText) return;

  const supabase = supabaseServer();
  const { count } = await supabase
    .from("questionnaire_questions")
    .select("id", { count: "exact", head: true })
    .eq("questionnaire_id", questionnaireId);

  await supabase.from("questionnaire_questions").insert({
    questionnaire_id: questionnaireId,
    order_no: (count ?? 0) + 1,
    question_text: questionText,
    question_type: questionType,
    options,
    required,
  });

  revalidatePath(`/admin/questionnaires/${questionnaireId}`);
}

// 系統流程用到的問卷（lib/questionnaireSystem.ts）名稱不能改，說明與分類可以。
export async function updateQuestionnaireAction(formData: FormData) {
  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  const category = formData.get("category") as string;
  const description = (formData.get("description") as string)?.trim() || null;

  const supabase = supabaseServer();
  const { data: current } = await supabase.from("questionnaire_templates").select("name").eq("id", id).single();
  if (!current) return;

  const patch: { category: string; description: string | null; name?: string } = { category, description };
  if (name && !isSystemQuestionnaire(current.name)) patch.name = name;
  await supabase.from("questionnaire_templates").update(patch).eq("id", id);

  revalidatePath("/admin/questionnaires");
  revalidatePath(`/admin/questionnaires/${id}`);
}

async function questionContext(questionId: string) {
  const supabase = supabaseServer();
  const [{ data: question }, { count }] = await Promise.all([
    supabase
      .from("questionnaire_questions")
      .select("questionnaire_id, question_type, options, questionnaire_templates(name)")
      .eq("id", questionId)
      .single(),
    supabase.from("questionnaire_answers").select("id", { count: "exact", head: true }).eq("question_id", questionId),
  ]);
  if (!question) return null;
  const template = question.questionnaire_templates as { name: string } | { name: string }[] | null;
  const templateName = (Array.isArray(template) ? template[0]?.name : template?.name) ?? "";
  return { question, answered: (count ?? 0) > 0, system: isSystemQuestionnaire(templateName) };
}

// 已有人作答或屬系統問卷的題目：題型與選項 value 鎖住（舊答案存的是 value，計分也靠它），
// 只能改題目文字、選項顯示文字、必填。value 跟原本不同（含增刪、換順序）就整筆不存。
export async function updateQuestionAction(formData: FormData) {
  const id = formData.get("id") as string;
  const questionText = (formData.get("question_text") as string)?.trim();
  const required = formData.get("required") === "on";
  if (!questionText) return;

  const ctx = await questionContext(id);
  if (!ctx) return;

  let questionType = formData.get("question_type") as string;
  // 鎖住的題目表單送的是逐項 opt_value（hidden）＋ opt_label，而不是 value|label 文字框
  const optValues = formData.getAll("opt_value") as string[];
  const optLabels = formData.getAll("opt_label") as string[];
  let options =
    optValues.length > 0
      ? optValues.map((value, i) => ({ value, label: optLabels[i]?.trim() || value }))
      : parseOptions(formData.get("options") as string);
  if (ctx.answered || ctx.system) {
    questionType = ctx.question.question_type;
    const oldValues = ((ctx.question.options ?? []) as Option[]).map((o) => o.value);
    const newValues = options.map((o) => o.value);
    const sameValues = oldValues.length === newValues.length && oldValues.every((v, i) => v === newValues[i]);
    if (!sameValues) return;
  }
  if (questionType === "number" || questionType === "text") options = [];

  const supabase = supabaseServer();
  await supabase
    .from("questionnaire_questions")
    .update({ question_text: questionText, question_type: questionType, options, required })
    .eq("id", id);

  revalidatePath(`/admin/questionnaires/${ctx.question.questionnaire_id}`);
  revalidatePath("/patient", "layout");
  revalidatePath("/cases", "layout");
}

// 只刪得掉「沒人作答、且不屬系統問卷」的題目。不重排 order_no——計分與匯出都靠題號對應。
export async function deleteQuestionAction(formData: FormData) {
  const id = formData.get("id") as string;
  const ctx = await questionContext(id);
  if (!ctx || ctx.answered || ctx.system) return;

  const supabase = supabaseServer();
  await supabase.from("questionnaire_questions").delete().eq("id", id);
  revalidatePath(`/admin/questionnaires/${ctx.question.questionnaire_id}`);
  revalidatePath("/patient", "layout");
}
