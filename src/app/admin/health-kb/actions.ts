"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";

// 分類與連結欄位（2026-07-29）：pdf_url 是醫院發的衛教單張，機器人回答時會附在後面，
// 讓病人拿到的是官方文件而不只是模型改寫過的說法。空字串一律存 null，方便判斷有沒有設。
function kbLinkFields(formData: FormData) {
  const pick = (name: string) => ((formData.get(name) as string) ?? "").trim() || null;
  return { category: pick("category"), pdf_url: pick("pdf_url"), video_url: pick("video_url") };
}

export async function addKbEntryAction(formData: FormData) {
  const topic = (formData.get("topic") as string)?.trim();
  const content = (formData.get("content") as string)?.trim();
  if (!topic || !content) return;
  const supabase = supabaseServer();
  await supabase.from("health_education_kb").insert({ topic, content, ...kbLinkFields(formData) });
  revalidatePath("/admin/health-kb");
}

export async function toggleKbActiveAction(formData: FormData) {
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  const supabase = supabaseServer();
  await supabase.from("health_education_kb").update({ active: !active }).eq("id", id);
  revalidatePath("/admin/health-kb");
}

export async function updateKbEntryAction(formData: FormData) {
  const id = formData.get("id") as string;
  const topic = (formData.get("topic") as string)?.trim();
  const content = (formData.get("content") as string)?.trim();
  if (!id || !topic || !content) return;
  const supabase = supabaseServer();
  await supabase.from("health_education_kb").update({ topic, content, ...kbLinkFields(formData) }).eq("id", id);
  revalidatePath("/admin/health-kb");
}

export async function deleteKbEntryAction(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = supabaseServer();
  await supabase.from("health_education_kb").delete().eq("id", id);
  revalidatePath("/admin/health-kb");
}
