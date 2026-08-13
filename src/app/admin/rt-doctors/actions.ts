"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";

// 放射腫瘤科醫師清單（助理 2026-08-13 D9 指定要獨立的後台可維護清單）。
// 與「醫師代碼清單」是兩份不同的東西：那份的代碼會進研究編號，這份只用於放療紀錄與匯出。

function revalidate() {
  revalidatePath("/admin/rt-doctors");
  revalidatePath("/cases", "layout"); // 個案頁的放療下拉會用到
}

export async function addRtDoctorAction(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const codeRaw = (formData.get("export_code") as string)?.trim();
  if (!name) return;

  const supabase = supabaseServer();
  const { data } = await supabase
    .from("radiotherapy_doctors")
    .insert({ name, export_code: codeRaw ? Number(codeRaw) : null, sort_order: codeRaw ? Number(codeRaw) : 99 })
    .select("id")
    .single();
  const operator = await getCurrentOperator();
  await logAudit({
    operatorName: operator ?? "未知",
    action: "add_rt_doctor",
    entity: "radiotherapy_doctors",
    entityId: data?.id,
    detail: { name, exportCode: codeRaw },
  });
  revalidate();
}

export async function updateRtDoctorAction(formData: FormData) {
  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  const codeRaw = (formData.get("export_code") as string)?.trim();
  if (!id || !name) return;
  const supabase = supabaseServer();
  await supabase
    .from("radiotherapy_doctors")
    .update({ name, export_code: codeRaw ? Number(codeRaw) : null })
    .eq("id", id);
  revalidate();
}

export async function toggleRtDoctorActiveAction(formData: FormData) {
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  const supabase = supabaseServer();
  await supabase.from("radiotherapy_doctors").update({ active: !active }).eq("id", id);
  revalidate();
}

export async function deleteRtDoctorAction(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = supabaseServer();
  // 放療紀錄存的是姓名文字快照，不是外鍵，所以刪得掉；
  // 但既有紀錄仍會顯示原本的姓名，只是選單不再提供。要保留可選性請改用「停用」。
  await supabase.from("radiotherapy_doctors").delete().eq("id", id);
  revalidate();
}
