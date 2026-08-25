// 待補清單的結案路徑（2026-08-24）。
//
// 病人自填那條路徑答不出來的項目會進 `case_intake_followups`（見 patient/[caseId]/intake/actions.ts），
// 但**人員在個案頁把那一格補起來時，清單原本不會有任何反應**——要另外捲回上面按一次「標記已補」。
// 待補清單的用途就是「照著補」，補完了還亮著紅字，人員只會學會不要相信它。
//
// 這裡只處理「補了值就等於處理完」的欄位；答「有」但要追細節的那種（例如之前類固醇注射的
// 日期/次數）補的是同一格，補進去就是有內容了，同樣視為結案。
//
// 不放在 server action 檔案裡：那些檔案有 "use server"，每個 export 都會變成一個可被
// 外部 POST 的端點，這個函式沒有理由暴露成端點。

import { supabaseServer } from "@/lib/supabase";

/**
 * 把指定欄位裡「已經有值」的那幾筆待補標記為已處理。
 *
 * @param filled 欄位鍵 → 這次存進去的值。值是空的（null／空字串）代表還是沒補，不動它。
 */
export async function resolveFilledFollowups(
  caseId: string,
  filled: Record<string, unknown>,
  operator: string,
  staffNote = "已於個案頁補填"
): Promise<void> {
  const keys = Object.entries(filled)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k]) => k);
  if (keys.length === 0) return;

  const supabase = supabaseServer();
  await supabase
    .from("case_intake_followups")
    .update({
      status: "resolved",
      staff_note: staffNote,
      resolved_by: operator,
      resolved_at: new Date().toISOString(),
    })
    .eq("case_id", caseId)
    .eq("status", "pending")
    .in("field_key", keys);
}
