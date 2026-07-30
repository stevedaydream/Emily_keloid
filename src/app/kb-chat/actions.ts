"use server";

import { supabaseServer } from "@/lib/supabase";
import { askGeminiWithKb } from "@/lib/gemini";
import { loadLineTemplates } from "@/lib/lineTemplates";
import { logBotFailure } from "@/lib/botLog";

export async function askHealthEducationBotAction(_prev: unknown, formData: FormData) {
  const question = (formData.get("question") as string)?.trim();
  if (!question) return { question: "", answer: "" };

  const supabase = supabaseServer();
  const { data: kbEntries } = await supabase
    .from("health_education_kb")
    .select("id, topic, content, category, pdf_url, video_url")
    .eq("active", true)
    .order("sort_order");

  // 示範對話頁也要吃後台設定的語氣／制式回答，否則跟病人在 LINE 看到的不一樣。
  const t = await loadLineTemplates(supabase);
  const result = await askGeminiWithKb(question, kbEntries ?? [], t);
  if (result.failure) await logBotFailure(supabase, result.failure, "kb_chat");
  return { question, answer: result.answer };
}
