// LINE 綁定與提醒的共用邏輯。平台這邊**不持有任何 LINE 憑證**——
// channel access token / secret 只存在 GAS，平台只負責「誰該收到什麼訊息」與資料庫讀寫。

import type { SupabaseClient } from "@supabase/supabase-js";

/** 綁定碼有效時間（小時）。病人通常當天就會加好友，過期可在個案頁重新產生。 */
export const BIND_CODE_TTL_HOURS = 72;

// 綁定碼刻意避開容易看錯的字元：0/O、1/I/L、2/Z、5/S、8/B。
// 長輩要照著唸或打字，少一個誤判就少一次綁錯人。
const CODE_ALPHABET = "34679ACDEFGHJKMNPQRTUVWXY";
const CODE_LENGTH = 6;

export function generateBindCode(): string {
  let code = "";
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

/** 病人要在 LINE 對話框送出的內容。加關鍵字讓 GAS 能跟一般聊天訊息區分開。 */
export function bindMessageFor(code: string): string {
  return `綁定 ${code}`;
}

/**
 * 掃碼即綁的連結：LINE 的 oaMessage scheme 會開啟與官方帳號的對話並**預填**訊息，
 * 病人只要按送出，不必自己打字（長輩打錯字是綁定碼最大的失敗來源）。
 * 需要官方帳號的 basic id（形如 @abc1234），沒設定時回 null，畫面就只顯示綁定碼。
 */
export function bindDeepLink(code: string, basicId: string | undefined | null): string | null {
  const id = (basicId ?? "").trim();
  if (!id) return null;
  const normalized = id.startsWith("@") ? id : `@${id}`;
  return `https://line.me/R/oaMessage/${encodeURIComponent(normalized)}/?${encodeURIComponent(bindMessageFor(code))}`;
}

/** 從病人的訊息文字裡抓綁定碼；抓不到回 null（那就是一般衛教提問）。 */
export function extractBindCode(text: string): string | null {
  const cleaned = (text ?? "").trim().toUpperCase();
  // 「綁定 ABC123」「綁定:ABC123」「BIND ABC123」，或直接只打 6 碼
  const m = cleaned.match(/(?:綁定|BIND)\s*[:：]?\s*([A-Z0-9]{6})/) ?? cleaned.match(/^([A-Z0-9]{6})$/);
  return m ? m[1] : null;
}

// ── LINE Quick Reply（訊息下方浮出的按鈕）────────────────────────────
// 讓病人不用打字就能瀏覽衛教。選 Quick Reply 而不是 Rich Menu（六宮格）的理由：
// Rich Menu 要一張 2500×1686 的圖片（美術成本），Quick Reply 純 JSON、零圖片，
// 而且能隨衛教資料庫的內容自動長出來，不必每次改內容就重畫圖。

/** LINE 的 label 上限 20 字元，超過會整顆按鈕被拒收，所以一律截斷。 */
const QUICK_LABEL_MAX = 20;
/** LINE 單則訊息最多 13 顆 quick reply。留一顆給「找診間」。 */
const QUICK_REPLY_MAX = 12;

export const KB_MENU_KEYWORDS = ["衛教", "選單", "諮詢", "主題", "menu"];
/** 病人點主題按鈕時實際送出的文字前綴，用來跟一般提問區分。 */
export const KB_TOPIC_PREFIX = "衛教主題：";

export type QuickReplyItem = { label: string; text: string };

function truncateLabel(text: string): string {
  const t = text.trim();
  return t.length > QUICK_LABEL_MAX ? `${t.slice(0, QUICK_LABEL_MAX - 1)}…` : t;
}

/** 依衛教資料庫產生主題按鈕。內容變多時只會列前 12 則（依 sort_order）。 */
export function kbQuickReplies(entries: { topic: string }[]): QuickReplyItem[] {
  const items = entries.slice(0, QUICK_REPLY_MAX).map((e) => ({
    label: truncateLabel(e.topic),
    text: `${KB_TOPIC_PREFIX}${e.topic}`,
  }));
  return items;
}

/** 病人送出的文字是不是在點某個主題按鈕；是的話回傳主題名稱。 */
export function extractKbTopic(text: string): string | null {
  const t = (text ?? "").trim();
  return t.startsWith(KB_TOPIC_PREFIX) ? t.slice(KB_TOPIC_PREFIX.length).trim() : null;
}

export function isKbMenuRequest(text: string): boolean {
  const t = (text ?? "").trim().toLowerCase();
  return KB_MENU_KEYWORDS.some((k) => t === k.toLowerCase());
}

export type ReminderKind = "visit" | "radiotherapy";

export type PendingReminder = {
  kind: ReminderKind;
  caseId: string;
  researchId: string;
  refId: string;
  dueDate: string;
  lineUserId: string;
  message: string;
};

/**
 * 組提醒訊息。**刻意不帶任何可識別身分的內容**（不放研究編號、不放部位、不放病歷號）——
 * LINE 訊息可能被家人看到，也可能出現在鎖定畫面的通知上。
 */
export function visitReminderMessage(dueDate: string, label: string): string {
  return [
    "【回診提醒】",
    `您有一次追蹤預定於 ${dueDate}（${label}）。`,
    "請依約回診，若需要改期請與診間聯繫。",
    "",
    "（此為自動提醒，請勿直接回覆此訊息以外的個人資料）",
  ].join("\n");
}

export function radiotherapyReminderMessage(dueDate: string, fractionNo: number, totalFractions: number): string {
  return [
    "【放射治療提醒】",
    `今天（${dueDate}）是您療程的第 ${fractionNo} 次，共 ${totalFractions} 次。`,
    "放射治療需要連續完成才有效果，請務必準時前往。",
    "",
    "（此為自動提醒，請勿直接回覆此訊息以外的個人資料）",
  ].join("\n");
}

/**
 * 撈出指定日期該推的提醒。
 * - 回診：`case_schedule_items` 裡 pending、動作含 `visit_reminder`、到期日 ≤ 指定日期（逾期的也要提醒）
 * - 放療：`radiotherapy_sessions` 裡 pending、到期日 = 指定日期（放療是當天的事，逾期補推沒有意義）
 * 兩者都只挑**已綁定 LINE**的個案，並排除今天已經推過的（依 line_reminder_log 的唯一索引）。
 */
export async function collectDueReminders(
  supabase: SupabaseClient,
  date: string
): Promise<PendingReminder[]> {
  const { data: boundCases } = await supabase
    .from("cases")
    .select("id, research_id, line_user_id")
    .eq("line_bound", true)
    .not("line_user_id", "is", null);

  const caseById = new Map((boundCases ?? []).map((c) => [c.id as string, c]));
  if (caseById.size === 0) return [];
  const caseIds = [...caseById.keys()];

  const [{ data: visits }, { data: sessions }, { data: alreadySent }] = await Promise.all([
    supabase
      .from("case_schedule_items")
      .select("id, case_id, label, due_date, actions")
      .eq("status", "pending")
      .lte("due_date", date)
      .in("case_id", caseIds),
    supabase
      .from("radiotherapy_sessions")
      .select("id, case_id, fraction_no, total_fractions, due_date")
      .eq("status", "pending")
      .eq("due_date", date)
      .in("case_id", caseIds),
    supabase.from("line_reminder_log").select("kind, ref_id, due_date").eq("status", "sent"),
  ]);

  const sentKey = new Set((alreadySent ?? []).map((r) => `${r.kind}:${r.ref_id}:${r.due_date}`));
  const out: PendingReminder[] = [];

  for (const item of visits ?? []) {
    const actions: string[] = item.actions ?? [];
    if (!actions.includes("visit_reminder")) continue;
    if (sentKey.has(`visit:${item.id}:${item.due_date}`)) continue;
    const c = caseById.get(item.case_id)!;
    out.push({
      kind: "visit",
      caseId: item.case_id,
      researchId: c.research_id,
      refId: item.id,
      dueDate: item.due_date,
      lineUserId: c.line_user_id,
      message: visitReminderMessage(item.due_date, item.label),
    });
  }

  for (const s of sessions ?? []) {
    if (sentKey.has(`radiotherapy:${s.id}:${s.due_date}`)) continue;
    const c = caseById.get(s.case_id)!;
    out.push({
      kind: "radiotherapy",
      caseId: s.case_id,
      researchId: c.research_id,
      refId: s.id,
      dueDate: s.due_date,
      lineUserId: c.line_user_id,
      message: radiotherapyReminderMessage(s.due_date, s.fraction_no, s.total_fractions),
    });
  }

  return out;
}
