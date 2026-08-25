"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";
import { TEST_MODE_KEY } from "@/lib/appSettings";

async function operatorOrThrow() {
  const op = await getCurrentOperator();
  if (!op) throw new Error("未選擇操作者");
  return op;
}

export async function setTestModeAction(formData: FormData) {
  const on = formData.get("on") === "1";
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  await supabase
    .from("app_settings")
    .upsert(
      { key: TEST_MODE_KEY, value: on, updated_at: new Date().toISOString(), updated_by: operator },
      { onConflict: "key" }
    );

  await logAudit({ operatorName: operator, action: on ? "test_mode_on" : "test_mode_off", entity: "app_settings" });
  // 開關影響全站的橫幅與建檔行為，整站重新驗證
  revalidatePath("/", "layout");
}

/**
 * 刪除所有測試個案。
 *
 * 個案底下的資料表沒有全部設 on delete cascade（有些是刻意的，避免誤刪連帶清空），
 * 所以這裡逐張照相依順序刪，最後才刪 cases。順序錯了會被外鍵擋下來。
 *
 * 只刪 is_test = true 的個案——正式資料一筆都不會動到。
 */
export async function deleteTestCasesAction() {
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  const { data: testCases } = await supabase.from("cases").select("id").eq("is_test", true);
  const ids = (testCases ?? []).map((c) => c.id);
  if (ids.length === 0) return { deleted: 0 };

  const { data: responses } = await supabase.from("questionnaire_responses").select("id").in("case_id", ids);
  const responseIds = (responses ?? []).map((r) => r.id);
  if (responseIds.length > 0) {
    await supabase.from("questionnaire_answers").delete().in("response_id", responseIds);
  }
  await supabase.from("questionnaire_responses").delete().in("case_id", ids);

  const { data: optionRecords } = await supabase.from("case_intake_option_records").select("id").in("case_id", ids);
  const optionRecordIds = (optionRecords ?? []).map((r) => r.id);
  if (optionRecordIds.length > 0) {
    await supabase.from("case_intake_option_record_items").delete().in("record_id", optionRecordIds);
  }
  await supabase.from("case_intake_option_records").delete().in("case_id", ids);

  const { data: termRecords } = await supabase.from("case_term_records").select("id").in("case_id", ids);
  const termRecordIds = (termRecords ?? []).map((r) => r.id);
  if (termRecordIds.length > 0) {
    await supabase.from("case_term_record_items").delete().in("record_id", termRecordIds);
  }
  await supabase.from("case_term_records").delete().in("case_id", ids);

  // photos 參照 case_keloid_lesions，要先刪照片再刪病灶
  await supabase.from("photos").delete().in("case_id", ids);
  await supabase.from("case_keloid_lesions").delete().in("case_id", ids);

  for (const table of [
    "treatment_records",
    "case_schedule_items",
    "case_diagnoses",
    "case_data_completeness",
    "case_intake_followups",
    "case_patient_intake_progress",
    "lab_results",
    "biobank_checklist_items",
    "biobank_samples",
    "radiotherapy_sessions",
    "line_reminder_log",
    "audit_log",
  ] as const) {
    await supabase.from(table).delete().in("case_id", ids);
  }

  const { error } = await supabase.from("cases").delete().in("id", ids);
  if (error) throw new Error(`刪除測試個案失敗：${error.message}`);

  await logAudit({
    operatorName: operator,
    action: "delete_test_cases",
    entity: "cases",
    detail: { count: ids.length },
  });
  revalidatePath("/", "layout");
  return { deleted: ids.length };
}
