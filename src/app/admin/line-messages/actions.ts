"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { LINE_TEMPLATE_BY_KEY } from "@/lib/lineTemplates";

// 這一頁改的是**病人會直接看到的文字**，所以留下誰改的。
// logAudit 需要 caseId、這裡沒有個案，改記在 line_message_templates.updated_by。

export async function saveLineTemplateAction(formData: FormData) {
  const key = ((formData.get("key") as string) ?? "").trim();
  const def = LINE_TEMPLATE_BY_KEY.get(key);
  // 登錄檔沒有的 key 一律不收——避免有人塞出一堆孤兒設定。
  if (!def) return;

  // 空字串是有效值（例如把提醒結尾整行拿掉），所以不做 falsy 檢查，只有數字型別要擋。
  const content = ((formData.get("content") as string) ?? "").replace(/\r\n/g, "\n");
  if (def.kind === "number" && !Number.isFinite(Number(content.trim()))) return;

  const supabase = supabaseServer();
  await supabase.from("line_message_templates").upsert(
    {
      key,
      content,
      updated_at: new Date().toISOString(),
      updated_by: await getCurrentOperator(),
    },
    { onConflict: "key" }
  );
  revalidatePath("/admin/line-messages");
}

/** 恢復預設＝刪掉覆寫列，不是寫回預設字串（預設值之後在程式裡改了才跟得上）。 */
export async function resetLineTemplateAction(formData: FormData) {
  const key = ((formData.get("key") as string) ?? "").trim();
  if (!LINE_TEMPLATE_BY_KEY.has(key)) return;

  const supabase = supabaseServer();
  await supabase.from("line_message_templates").delete().eq("key", key);
  revalidatePath("/admin/line-messages");
}
