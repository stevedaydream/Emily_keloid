"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";

export async function addIcdCodeAction(formData: FormData) {
  const code = (formData.get("code") as string)?.trim();
  const system = formData.get("system") as string;
  const descriptionFull = (formData.get("description_full") as string)?.trim();
  // 對照鍵：同一組 ICD-9/ICD-10 填相同的值即互為對照（見 20260727160000 migration）
  const mappingKey = ((formData.get("mapping_key") as string) || "").trim() || null;
  if (!code || !descriptionFull) return;
  const supabase = supabaseServer();
  await supabase.from("icd_codes").insert({ code, system, description_full: descriptionFull, mapping_key: mappingKey });
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
  const mappingKey = ((formData.get("mapping_key") as string) || "").trim() || null;
  if (!id || !code || !descriptionFull) return;
  const supabase = supabaseServer();
  await supabase
    .from("icd_codes")
    .update({ code, system, description_full: descriptionFull, mapping_key: mappingKey })
    .eq("id", id);
  revalidatePath("/admin/icd");
}

export async function deleteIcdCodeAction(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = supabaseServer();
  // 若已有診斷紀錄引用此碼，外鍵限制會讓刪除失敗（不影響既有資料），請改用停用。
  await supabase.from("icd_codes").delete().eq("id", id);
  revalidatePath("/admin/icd");
}
