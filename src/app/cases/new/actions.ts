"use server";

import { supabaseServer } from "@/lib/supabase";
import { generateResearchId } from "@/lib/researchId";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";
import { BIOBANK_ITEM_LABEL } from "@/lib/biobank";
import { isTestMode } from "@/lib/appSettings";

/**
 * 建立個案。
 *
 * 回傳值而不是 throw 來表達「病歷號重複」：Next.js 在正式環境會把 server action 丟出的
 * 錯誤訊息抹掉（只留一組 digest），使用者只會看到「Failed to fetch」之類的東西——
 * 實測就是這樣。**可預期的驗證結果要用回傳值傳遞**，throw 留給真正的意外。
 */
export type CreateCaseResult =
  | { ok: true; caseId: string; researchId: string }
  | { ok: false; error: string };

export async function createCaseAction(formData: FormData): Promise<CreateCaseResult> {
  const supabase = supabaseServer();
  const operator = (await getCurrentOperator()) ?? "未知操作者";

  // 收案表單三格：醫師、病歷號、姓名。性別／年齡／出生日期／手機由病人自填頁收；
  // ICD 診斷、同意書日期在個案頁補；追蹤時程改以手術日起算，登記手術後才產生。
  //
  // 2026-08-25：病歷號與姓名改為**明文存雲端**（廢除本機對照表／加密保管庫，見 migration
  // 20260825050000 的說明）。因此重複檢查也從「瀏覽器比對本機檔案」改成在這裡做——
  // 這才是唯一擋得住的地方：多裝置共用同一份資料，而且擋不掉時還有 DB 的 unique index。
  const doctorId = formData.get("doctor_id") as string;
  const mrn = ((formData.get("mrn") as string) ?? "").trim();
  const patientName = ((formData.get("patient_name") as string) ?? "").trim();

  // 撞號硬擋，沒有「仍要建立」的出口（沿用 2026-08-20 的規則）：
  // 一個病歷號就是一個人，同一位病人又長了新的病灶，那是在既有個案上加一顆病灶，不是重新收案。
  // 比對正規化只做去空白＋忽略大小寫，**不去前置 0**——`0012345` 與 `12345` 在院內是不同的號。
  if (mrn) {
    const { data: clash } = await supabase
      .from("cases")
      .select("id, research_id, patient_name, created_at")
      .ilike("mrn", mrn)
      .limit(1)
      .maybeSingle();
    if (clash) {
      return {
        ok: false,
        error: `病歷號 ${mrn} 已經收過案了：${clash.research_id}${
          clash.patient_name ? `・${clash.patient_name}` : ""
        }（收於 ${String(clash.created_at).slice(0, 10)}）。同一位病人只該有一筆個案；若是新長的病灶，請到那筆個案新增病灶，不要重新收案。`,
      };
    }
  }

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
      mrn: mrn || null,
      patient_name: patientName || null,
      // 測試模式的章在建檔當下蓋（2026-08-25）。之後把開關關掉，這一筆仍然是測試個案——
      // 標記屬於這筆資料，不是屬於當下的開關。
      is_test: await isTestMode(),
    })
    .select("id")
    .single();

  if (error || !newCase) {
    // 上面查過一次仍撞號＝兩台裝置同時送出。DB 的 unique index 是最後一道，訊息要講人話。
    if (error?.code === "23505" && String(error.message).includes("cases_mrn_unique")) {
      return { ok: false, error: `病歷號 ${mrn} 剛剛已經被另一台裝置收案了，請重新整理個案列表確認。` };
    }
    throw error ?? new Error("建立個案失敗");
  }

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

  return { ok: true, caseId: newCase.id, researchId };
}
