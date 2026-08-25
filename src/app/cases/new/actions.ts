"use server";

import { supabaseServer } from "@/lib/supabase";
import { generateResearchId } from "@/lib/researchId";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";
import { BIOBANK_ITEM_LABEL } from "@/lib/biobank";
import { isTestMode } from "@/lib/appSettings";

export async function createCaseAction(formData: FormData): Promise<{ caseId: string; researchId: string }> {
  const supabase = supabaseServer();
  const operator = (await getCurrentOperator()) ?? "未知操作者";

  // 收案表單只剩三格（決策 2026-08-20，見 pending.md F-B）：病歷號、姓名都只寫本機對照表，
  // 送到伺服器的實際上只有 doctor_id。性別／年齡／出生日期／手機由病人自填頁收；
  // ICD 診斷、同意書日期在個案頁補；追蹤時程改以手術日起算，登記手術後才產生。
  const doctorId = formData.get("doctor_id") as string;

  const { data: doctor } = await supabase
    .from("doctors")
    .select("code")
    .eq("id", doctorId)
    .single();
  if (!doctor) throw new Error("找不到醫師代碼");

  const year = new Date().getFullYear();
  const { researchId, sequenceNo } = await generateResearchId(
    supabase,
    doctorId,
    doctor.code,
    year
  );

  const { data: newCase, error } = await supabase
    .from("cases")
    .insert({
      research_id: researchId,
      doctor_id: doctorId,
      enrollment_year: year,
      sequence_no: sequenceNo,
      created_by: operator,
      // 測試模式的章在建檔當下蓋（2026-08-25）。之後把開關關掉，這一筆仍然是測試個案——
      // 標記屬於這筆資料，不是屬於當下的開關。
      is_test: await isTestMode(),
    })
    .select("id")
    .single();

  if (error || !newCase) throw error ?? new Error("建立個案失敗");

  // 術前抽血 baseline：唯一 100% 必做、且必須在手術前完成的事，所以收案當下就開待辦
  // （決策 2026-08-20 F-E6）。其餘三次抽血以手術日為錨點，登記手術時才產生。
  await supabase.from("biobank_checklist_items").insert({
    case_id: newCase.id,
    item_key: "blood_pre_op",
    item_label: BIOBANK_ITEM_LABEL["blood_pre_op"],
    collected: false,
  });

  await logAudit({
    caseId: newCase.id,
    operatorName: operator,
    action: "create_case",
    entity: "cases",
    entityId: newCase.id,
    detail: { research_id: researchId },
  });

  return { caseId: newCase.id, researchId };
}
