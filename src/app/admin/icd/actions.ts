"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";

export async function addIcdCodeAction(formData: FormData) {
  const code = (formData.get("code") as string)?.trim();
  const system = formData.get("system") as string;
  const descriptionFull = (formData.get("description_full") as string)?.trim();
  if (!code || !descriptionFull) return;
  const supabase = supabaseServer();
  await supabase.from("icd_codes").insert({ code, system, description_full: descriptionFull });
  revalidatePath("/admin/icd");
}

export async function toggleIcdActiveAction(formData: FormData) {
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  const supabase = supabaseServer();
  await supabase.from("icd_codes").update({ active: !active }).eq("id", id);
  revalidatePath("/admin/icd");
}

export async function updateIcdCodeAction(formData: FormData) {
  const id = formData.get("id") as string;
  const code = (formData.get("code") as string)?.trim();
  const system = formData.get("system") as string;
  const descriptionFull = (formData.get("description_full") as string)?.trim();
  if (!id || !code || !descriptionFull) return;
  const supabase = supabaseServer();
  await supabase.from("icd_codes").update({ code, system, description_full: descriptionFull }).eq("id", id);
  revalidatePath("/admin/icd");
}

export async function deleteIcdCodeAction(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = supabaseServer();
  // 若已有診斷紀錄引用此碼，外鍵限制會讓刪除失敗（不影響既有資料），請改用停用。
  await supabase.from("icd_codes").delete().eq("id", id);
  revalidatePath("/admin/icd");
}
