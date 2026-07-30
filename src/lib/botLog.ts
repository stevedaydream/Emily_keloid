import type { SupabaseClient } from "@supabase/supabase-js";

export type BotFailure = { stage: "gemini_match" | "gemini_rewrite"; reason: string };

/**
 * 記一筆機器人失敗。**寫入失敗一律吞掉**——log 寫不進去絕不能反過來害病人收不到回覆，
 * 這是紀錄不是業務邏輯。
 *
 * 呼叫端負責決定 source；問題內容不傳進來（可能含病人自己打的個資，見 migration 註解）。
 */
export async function logBotFailure(
  supabase: SupabaseClient,
  failure: BotFailure,
  source: "line" | "kb_chat"
): Promise<void> {
  try {
    await supabase.from("line_bot_error_log").insert({
      stage: failure.stage,
      reason: failure.reason.slice(0, 500),
      source,
    });
  } catch {
    // 故意留白
  }
}
