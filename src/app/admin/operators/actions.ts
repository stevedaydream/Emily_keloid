"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { toLandingMode } from "@/lib/operator";

// landing_mode 決定這位操作者選完身分後落在哪一頁（今日門診／收案／儀表板／後台管理）。
// 只是預設落點，不阻擋任何人前往任何頁面——見 20260820020000 migration 的註解。
const normalizeLandingMode = (raw: FormDataEntryValue | null) => toLandingMode(raw);

export async function addOperatorAction(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const role = (formData.get("role") as string)?.trim() || null;
  const landingMode = normalizeLandingMode(formData.get("landing_mode"));
  const navCompact = formData.get("nav_compact") === "on";
  if (!name) return;
  const supabase = supabaseServer();
  await supabase.from("operators").insert({ name, role, landing_mode: landingMode, nav_compact: navCompact });
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
  revalidatePath("/", "layout");
}

// 導覽列精簡模式：開啟時非核心功能收進「更多」（見 pending.md F-A6）。
// 診間護理師開啟，其餘角色關閉。這是動線不是權限——收折的頁面仍然進得去。
export async function toggleNavCompactAction(formData: FormData) {
  const id = formData.get("id") as string;
  const enabled = formData.get("nav_compact") === "true";
  const supabase = supabaseServer();
  await supabase.from("operators").update({ nav_compact: !enabled }).eq("id", id);
  revalidatePath("/admin/operators");
  revalidatePath("/", "layout");
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
