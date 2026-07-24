import { SupabaseClient } from "@supabase/supabase-js";

// 研究編號規則：[醫師代碼]-[年份]-[流水序號]，序號依「醫師代碼＋年份」每年歸零。
export async function generateResearchId(
  supabase: SupabaseClient,
  doctorId: string,
  doctorCode: string,
  year: number
) {
  const { data: existing, error } = await supabase
    .from("cases")
    .select("sequence_no")
    .eq("doctor_id", doctorId)
    .eq("enrollment_year", year)
    .order("sequence_no", { ascending: false })
    .limit(1);

  if (error) throw error;

  const nextSeq = (existing?.[0]?.sequence_no ?? 0) + 1;
  const researchId = `${doctorCode}-${year}-${String(nextSeq).padStart(3, "0")}`;
  return { researchId, sequenceNo: nextSeq };
}
