"use server";

import { supabaseServer } from "@/lib/supabase";
import { askGeminiWithKb } from "@/lib/gemini";

export async function askHealthEducationBotAction(_prev: unknown, formData: FormData) {
  const question = (formData.get("question") as string)?.trim();
  if (!question) return { question: "", answer: "" };

  const supabase = supabaseServer();
  const { data: kbEntries } = await supabase
    .from("health_education_kb")
    .select("topic, content")
    .eq("active", true)
    .order("sort_order");

  const result = await askGeminiWithKb(question, kbEntries ?? []);
  return { question, answer: result.answer };
}
