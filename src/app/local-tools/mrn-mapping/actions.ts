"use server";

import { supabaseServer } from "@/lib/supabase";

// 只接受研究編號，絕不接受病歷號參數——維持「病歷號不上雲端」的原則。
export async function lookupCaseIdByResearchId(researchId: string): Promise<string | null> {
  const supabase = supabaseServer();
  const { data } = await supabase.from("cases").select("id").eq("research_id", researchId.trim()).maybeSingle();
  return data?.id ?? null;
}
