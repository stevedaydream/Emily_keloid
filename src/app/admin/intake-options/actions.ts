"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";

export async function addIntakeOptionAction(formData: FormData) {
  const category = formData.get("category") as string;
  const label = (formData.get("label") as string)?.trim();
  if (!label) return;
  const supabase = supabaseServer();
  await supabase.from("case_intake_option_lists").insert({ category, label });
  revalidatePath("/admin/intake-options");
}

export async function toggleIntakeOptionActiveAction(formData: FormData) {
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  const supabase = supabaseServer();
  await supabase.from("case_intake_option_lists").update({ active: !active }).eq("id", id);
  revalidatePath("/admin/intake-options");
}
