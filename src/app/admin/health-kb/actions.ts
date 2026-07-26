"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";

export async function addKbEntryAction(formData: FormData) {
  const topic = (formData.get("topic") as string)?.trim();
  const content = (formData.get("content") as string)?.trim();
  if (!topic || !content) return;
  const supabase = supabaseServer();
  await supabase.from("health_education_kb").insert({ topic, content });
  revalidatePath("/admin/health-kb");
}

export async function toggleKbActiveAction(formData: FormData) {
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  const supabase = supabaseServer();
  await supabase.from("health_education_kb").update({ active: !active }).eq("id", id);
  revalidatePath("/admin/health-kb");
}
