"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";

export async function addLabMarkerAction(formData: FormData) {
  const marker_key = (formData.get("marker_key") as string)?.trim();
  const display_name = (formData.get("display_name") as string)?.trim();
  const unit = (formData.get("unit") as string)?.trim() || null;
  if (!marker_key || !display_name) return;
  const supabase = supabaseServer();
  await supabase.from("lab_marker_definitions").insert({ marker_key, display_name, unit });
  revalidatePath("/admin/lab-markers");
}

export async function toggleLabMarkerActiveAction(formData: FormData) {
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  const supabase = supabaseServer();
  await supabase.from("lab_marker_definitions").update({ active: !active }).eq("id", id);
  revalidatePath("/admin/lab-markers");
}
