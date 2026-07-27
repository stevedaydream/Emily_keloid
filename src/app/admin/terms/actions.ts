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

export async function updateTermAction(formData: FormData) {
  const id = formData.get("id") as string;
  const stage = formData.get("stage") as string;
  const term = (formData.get("term") as string)?.trim();
  const imageUrl = (formData.get("image_url") as string)?.trim() || null;
  if (!id || !term) return;
  const supabase = supabaseServer();
  await supabase.from("term_library").update({ stage, term, image_url: imageUrl }).eq("id", id);
  revalidatePath("/admin/terms");
}

export async function deleteTermAction(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = supabaseServer();
  // 若已有紀錄引用此術語，外鍵限制會讓刪除失敗（不影響既有資料），請改用停用。
  await supabase.from("term_library").delete().eq("id", id);
  revalidatePath("/admin/terms");
}
