"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";

// 一次輸入一組 ICD-9／ICD-10 對照（決策 2026-07-27）。
// 兩邊都填就建立兩筆共用同一個 mapping_key 的碼；只填一邊也可以（不強制有對照），
// 之後要補另一邊時，在該筆的「對照鍵」填相同的值即可配成對。
export async function addIcdPairAction(formData: FormData) {
  const icd9Code = ((formData.get("icd9_code") as string) || "").trim();
  const icd10Code = ((formData.get("icd10_code") as string) || "").trim();
  const sharedDesc = ((formData.get("description_full") as string) || "").trim();
  const icd9Desc = ((formData.get("icd9_description") as string) || "").trim() || sharedDesc;
  const icd10Desc = ((formData.get("icd10_description") as string) || "").trim() || sharedDesc;
  if (!icd9Code && !icd10Code) return;
  if ((icd9Code && !icd9Desc) || (icd10Code && !icd10Desc)) return;

  // 對照鍵：使用者可自訂，留空則依填入的代碼自動產生（例：pair_7014_l910）
  const mappingKey =
    ((formData.get("mapping_key") as string) || "").trim() ||
    `pair_${(icd9Code || "x").toLowerCase()}_${(icd10Code || "x").toLowerCase()}`;

  const rows = [
    ...(icd9Code ? [{ code: icd9Code, system: "ICD9", description_full: icd9Desc, mapping_key: mappingKey }] : []),
    ...(icd10Code ? [{ code: icd10Code, system: "ICD10", description_full: icd10Desc, mapping_key: mappingKey }] : []),
  ];

  const supabase = supabaseServer();
  await supabase.from("icd_codes").insert(rows);
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
