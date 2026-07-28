"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";

// landing_mode 決定這位操作者選完身分後落在哪一頁（intake=精簡收案頁 / full=完整後台）。
// 只是預設落點，不阻擋任何人前往任何頁面——見 20260729010000 migration 的註解。
const LANDING_MODES = ["intake", "full"] as const;
const normalizeLandingMode = (raw: FormDataEntryValue | null) =>
  LANDING_MODES.includes(raw as (typeof LANDING_MODES)[number]) ? (raw as string) : "full";

export async function addOperatorAction(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const role = (formData.get("role") as string)?.trim() || null;
  const landingMode = normalizeLandingMode(formData.get("landing_mode"));
  if (!name) return;
  const supabase = supabaseServer();
  await supabase.from("operators").insert({ name, role, landing_mode: landingMode });
  revalidatePath("/admin/operators");
}

export async function toggleOperatorActiveAction(formData: FormData) {
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  const supabase = supabaseServer();
  await supabase.from("operators").update({ active: !active }).eq("id", id);
  revalidatePath("/admin/operators");
}

export async function updateOperatorAction(formData: FormData) {
  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  const role = (formData.get("role") as string)?.trim() || null;
  const landingMode = normalizeLandingMode(formData.get("landing_mode"));
  if (!id || !name) return;
  const supabase = supabaseServer();
  await supabase.from("operators").update({ name, role, landing_mode: landingMode }).eq("id", id);
  revalidatePath("/admin/operators");
}

// 開發用旗標：允許在手機/平板上以唯讀方式掛載病歷號對照表（見 20260729030000 migration）。
// 正式收案前應全部關掉。
export async function toggleDevMobileMappingAction(formData: FormData) {
  const id = formData.get("id") as string;
  const enabled = formData.get("dev_mobile_mapping") === "true";
  const supabase = supabaseServer();
  await supabase.from("operators").update({ dev_mobile_mapping: !enabled }).eq("id", id);
  revalidatePath("/admin/operators");
  revalidatePath("/", "layout");
}

export async function deleteOperatorAction(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = supabaseServer();
  await supabase.from("operators").delete().eq("id", id);
  revalidatePath("/admin/operators");
}
