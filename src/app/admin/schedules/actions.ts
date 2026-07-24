"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";

export async function addScheduleTemplateAction(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;
  const supabase = supabaseServer();
  await supabase.from("schedule_templates").insert({ name });
  revalidatePath("/admin/schedules");
}

export async function addScheduleItemAction(formData: FormData) {
  const templateId = formData.get("template_id") as string;
  const label = (formData.get("label") as string)?.trim();
  const offsetDays = Number(formData.get("offset_days"));
  const actions = formData.getAll("actions") as string[];
  const questionnaireId = (formData.get("questionnaire_id") as string) || null;
  if (!label) return;

  const supabase = supabaseServer();
  await supabase.from("schedule_template_items").insert({
    template_id: templateId,
    label,
    offset_days: offsetDays,
    actions,
    questionnaire_id: actions.includes("questionnaire") ? questionnaireId : null,
  });
  revalidatePath("/admin/schedules");
}
