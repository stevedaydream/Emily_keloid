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

export async function updateLabMarkerAction(formData: FormData) {
  const id = formData.get("id") as string;
  const display_name = (formData.get("display_name") as string)?.trim();
  const unit = (formData.get("unit") as string)?.trim() || null;
  if (!id || !display_name) return;
  const supabase = supabaseServer();
  await supabase.from("lab_marker_definitions").update({ display_name, unit }).eq("id", id);
  revalidatePath("/admin/lab-markers");
}

export async function deleteLabMarkerAction(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = supabaseServer();
  // 若已有 lab_results 引用此標記，外鍵限制會讓刪除失敗（不影響既有資料），請改用停用。
  await supabase.from("lab_marker_definitions").delete().eq("id", id);
  revalidatePath("/admin/lab-markers");
}
