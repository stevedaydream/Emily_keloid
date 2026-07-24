"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";

export async function addTermAction(formData: FormData) {
  const stage = formData.get("stage") as string;
  const term = (formData.get("term") as string)?.trim();
  const imageUrl = (formData.get("image_url") as string)?.trim() || null;
  if (!term) return;
  const supabase = supabaseServer();
  await supabase.from("term_library").insert({ stage, term, image_url: imageUrl });
  revalidatePath("/admin/terms");
}

export async function toggleTermActiveAction(formData: FormData) {
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  const supabase = supabaseServer();
  await supabase.from("term_library").update({ active: !active }).eq("id", id);
  revalidatePath("/admin/terms");
}
