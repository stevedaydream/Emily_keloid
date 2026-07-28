"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";

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
  const optionsRaw = (formData.get("options") as string)?.trim();
  const required = formData.get("required") === "on";
  if (!questionText) return;

  // options 輸入格式：一行一個選項，格式 value|label
  const options = optionsRaw
    ? optionsRaw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [value, label] = line.split("|");
          return { value: value?.trim(), label: (label ?? value)?.trim() };
        })
    : [];

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
