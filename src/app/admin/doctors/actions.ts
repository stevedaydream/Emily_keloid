"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";

export async function addDoctorAction(formData: FormData) {
  const code = (formData.get("code") as string)?.toUpperCase().trim();
  const name = (formData.get("name") as string)?.trim();
  if (!code || !name) return;

  const supabase = supabaseServer();
  const { data } = await supabase.from("doctors").insert({ code, name }).select("id").single();
  const operator = await getCurrentOperator();
  await logAudit({ operatorName: operator ?? "未知", action: "add_doctor", entity: "doctors", entityId: data?.id, detail: { code, name } });
  revalidatePath("/admin/doctors");
}

export async function toggleDoctorActiveAction(formData: FormData) {
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  const supabase = supabaseServer();
  await supabase.from("doctors").update({ active: !active }).eq("id", id);
  revalidatePath("/admin/doctors");
}

export async function updateDoctorAction(formData: FormData) {
  const id = formData.get("id") as string;
  const code = (formData.get("code") as string)?.toUpperCase().trim();
  const name = (formData.get("name") as string)?.trim();
  if (!id || !code || !name) return;
  const supabase = supabaseServer();
  await supabase.from("doctors").update({ code, name }).eq("id", id);
  revalidatePath("/admin/doctors");
}

export async function deleteDoctorAction(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = supabaseServer();
  // 若已有個案使用此醫師代碼，外鍵限制會讓刪除失敗（不影響既有資料），請改用停用。
  await supabase.from("doctors").delete().eq("id", id);
  revalidatePath("/admin/doctors");
}
