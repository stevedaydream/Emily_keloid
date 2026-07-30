"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";

// 分類與連結欄位（2026-07-29）：pdf_url 是醫院發的衛教單張，機器人回答時會附在後面，
// 讓病人拿到的是官方文件而不只是模型改寫過的說法。空字串一律存 null，方便判斷有沒有設。
function kbLinkFields(formData: FormData) {
  const pick = (name: string) => ((formData.get(name) as string) ?? "").trim() || null;
  return { category: pick("category"), pdf_url: pick("pdf_url"), video_url: pick("video_url") };
}

// 排序欄位（2026-07-30）：LINE Quick Reply 一則訊息最多 13 顆按鈕，超過的主題不會出現，
// 所以排序必須是人可以決定的。空白代表不改（更新時）。
function kbSortOrder(formData: FormData): number | null {
  const raw = ((formData.get("sort_order") as string) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export async function addKbEntryAction(formData: FormData) {
  const topic = (formData.get("topic") as string)?.trim();
  const content = (formData.get("content") as string)?.trim();
  if (!topic || !content) return;
  const supabase = supabaseServer();

  // 新增的一律排在最後（不是跟大家並列 0），這樣既有主題在 LINE 選單裡的位置不會被新資料擠掉。
  const { data: last } = await supabase
    .from("health_education_kb")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = kbSortOrder(formData) ?? (last?.sort_order ?? 0) + 10;

  // active: false — 新增的衛教一律先「待啟用」，確認內容無誤後才由人手動啟用，
  // 避免打錯字或還沒定稿的內容直接出現在病人的 LINE 選單上（決策 2026-07-30）。
  await supabase.from("health_education_kb").insert({
    topic,
    content,
    active: false,
    sort_order: sortOrder,
    ...kbLinkFields(formData),
  });
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
  const sortOrder = kbSortOrder(formData);
  const supabase = supabaseServer();
  await supabase
    .from("health_education_kb")
    .update({
      topic,
      content,
      ...kbLinkFields(formData),
      ...(sortOrder === null ? {} : { sort_order: sortOrder }),
    })
    .eq("id", id);
  revalidatePath("/admin/health-kb");
}

export async function deleteKbEntryAction(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = supabaseServer();
  await supabase.from("health_education_kb").delete().eq("id", id);
  revalidatePath("/admin/health-kb");
}
