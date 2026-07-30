// LINE 綁定與提醒的共用邏輯。平台這邊**不持有任何 LINE 憑證**——
// channel access token / secret 只存在 GAS，平台只負責「誰該收到什麼訊息」與資料庫讀寫。

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_LINE_TEMPLATES,
  loadLineTemplates,
  type LineTemplates,
} from "./lineTemplates";

// 所有對外文案都走 LineTemplates（後台 /admin/line-messages 可改，改過才進資料表）。
// 每個函式都收一個可選的 t，沒給就用登錄檔的預設值——這樣純函式仍然可以單獨測試。

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
/** LINE 單則訊息的硬上限：13 顆。後台要據此提示「哪幾則排不進按鈕列」，所以 export。 */
export const KB_QUICK_REPLY_MAX = 13;
/** 兩層模式下的主題選單要留最後一顆給「⬅ 其他分類」，所以主題本身只放 12 顆。 */
export const KB_TOPIC_MAX = KB_QUICK_REPLY_MAX - 1;

/** 預設的選單關鍵字。實際生效的清單來自 t.list("menu.keywords")。 */
export const KB_MENU_KEYWORDS = DEFAULT_LINE_TEMPLATES.list("menu.keywords");
// 下面兩個前綴是**協定不是文案**，刻意不開放後台修改：病人手機上還沒點的舊按鈕
// 送出的仍是舊前綴，改了會讓那些按鈕通通失效變成一般提問。
/** 病人點主題按鈕時實際送出的文字前綴，用來跟一般提問區分。 */
export const KB_TOPIC_PREFIX = "衛教主題：";
/** 病人點分類按鈕時送出的文字前綴（兩層選單的第一層）。 */
export const KB_CATEGORY_PREFIX = "衛教分類：";
/** 後台沒填 category 的衛教一律歸在這個分類底下，不會因此消失在選單裡。 */
export const KB_UNCATEGORIZED = DEFAULT_LINE_TEMPLATES.text("menu.uncategorized");

export type QuickReplyItem = { label: string; text: string };
export type KbMenuEntry = { topic: string; category?: string | null };

/** 回上一層的按鈕。text 直接用選單關鍵字，走既有的 isKbMenuRequest 分支，不必多開一種訊息格式。 */
function kbBackItem(t: LineTemplates): QuickReplyItem {
  return { label: truncateLabel(t.text("menu.back_label")), text: t.list("menu.keywords")[0] };
}

function truncateLabel(text: string): string {
  const t = text.trim();
  return t.length > QUICK_LABEL_MAX ? `${t.slice(0, QUICK_LABEL_MAX - 1)}…` : t;
}

export function kbCategoryOf(entry: KbMenuEntry, t: LineTemplates = DEFAULT_LINE_TEMPLATES): string {
  return (entry.category ?? "").trim() || t.text("menu.uncategorized");
}

/** 依 entries 的既有順序（呼叫端已按 sort_order 排好）去重後的分類清單。 */
export function kbCategories(entries: KbMenuEntry[], t: LineTemplates = DEFAULT_LINE_TEMPLATES): string[] {
  const out: string[] = [];
  for (const e of entries) {
    const c = kbCategoryOf(e, t);
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * 某分類（不給 category 就是全部）底下的主題按鈕。
 * withBack=true 時末尾補一顆「⬅ 其他分類」，讓病人在第二層能回到第一層。
 */
export function kbTopicQuickReplies(
  entries: KbMenuEntry[],
  category?: string | null,
  withBack = false,
  t: LineTemplates = DEFAULT_LINE_TEMPLATES
): QuickReplyItem[] {
  const pool = category ? entries.filter((e) => kbCategoryOf(e, t) === category) : entries;
  const items = pool.slice(0, withBack ? KB_TOPIC_MAX : KB_QUICK_REPLY_MAX).map((e) => ({
    label: truncateLabel(e.topic),
    text: `${KB_TOPIC_PREFIX}${e.topic}`,
  }));
  return withBack ? [...items, kbBackItem(t)] : items;
}

export function kbCategoryQuickReplies(
  entries: KbMenuEntry[],
  t: LineTemplates = DEFAULT_LINE_TEMPLATES
): QuickReplyItem[] {
  return kbCategories(entries, t)
    .slice(0, KB_QUICK_REPLY_MAX)
    .map((c) => ({ label: truncateLabel(c), text: `${KB_CATEGORY_PREFIX}${c}` }));
}

/**
 * 主選單。**只有在「主題塞不進一則訊息」且「真的有兩個以上分類」時才分兩層**——
 * 內容還少的時候硬要分類，第一層會變成一顆孤零零的按鈕，反而多害病人點一次。
 * grouped 讓呼叫端知道現在是幾層，以便決定回覆的措辭與返回鈕。
 */
export function kbMenuQuickReplies(
  entries: KbMenuEntry[],
  t: LineTemplates = DEFAULT_LINE_TEMPLATES
): { items: QuickReplyItem[]; grouped: boolean } {
  const grouped = entries.length > KB_QUICK_REPLY_MAX && kbCategories(entries, t).length >= 2;
  return grouped
    ? { items: kbCategoryQuickReplies(entries, t), grouped: true }
    : { items: kbTopicQuickReplies(entries, undefined, false, t), grouped: false };
}

/** 病人送出的文字是不是在點某個主題按鈕；是的話回傳主題名稱。 */
export function extractKbTopic(text: string): string | null {
  const t = (text ?? "").trim();
  return t.startsWith(KB_TOPIC_PREFIX) ? t.slice(KB_TOPIC_PREFIX.length).trim() : null;
}

/** 病人送出的文字是不是在點某個分類按鈕；是的話回傳分類名稱。 */
export function extractKbCategory(text: string): string | null {
  const t = (text ?? "").trim();
  return t.startsWith(KB_CATEGORY_PREFIX) ? t.slice(KB_CATEGORY_PREFIX.length).trim() : null;
}

export function isKbMenuRequest(text: string, t: LineTemplates = DEFAULT_LINE_TEMPLATES): boolean {
  const input = (text ?? "").trim().toLowerCase();
  return t.list("menu.keywords").some((k) => input === k.toLowerCase());
}

// Quick Reply 只附在「這一則」回覆上，病人再打一句話按鈕就沒了，也沒有 Rich Menu 那種常駐入口
// （Rich Menu 要一張 2500×1686 美術圖，當初就是為了避開這成本才選 Quick Reply）。
// 折衷做法：回覆的文字裡固定留一條路回到選單。後台可以把這行清空來取消。
export function withKbMenuHint(reply: string, t: LineTemplates = DEFAULT_LINE_TEMPLATES): string {
  const hint = t.text("menu.hint", { keyword: t.list("menu.keywords")[0] }).trim();
  return hint ? `${reply}\n\n${hint}` : reply;
}

export type ReminderKind = "visit" | "radiotherapy";

export type PendingReminder = {
  kind: ReminderKind;
  caseId: string;
  researchId: string;
  refId: string;
  dueDate: string;
  /** 提前幾天送出這則。3＝提前提醒、0＝當天（含逾期補推）。同一個項目兩則各推一次。 */
  leadDays: number;
  lineUserId: string;
  /** 完整訊息（含共用結尾）。單筆推播用。 */
  message: string;
  /** 不含共用結尾的本文。合併同一人同一天的多則時用，避免結尾重複出現。 */
  body: string;
};

/**
 * 組提醒訊息。**刻意不帶任何可識別身分的內容**（不放研究編號、不放部位、不放病歷號）——
 * LINE 訊息可能被家人看到，也可能出現在鎖定畫面的通知上。
 */
/** 回診提醒提前幾天先通知一次的**預設值**（決策 2026-07-29：提前 3 天＋當天各一則）。實際值可在後台改。 */
export const VISIT_REMINDER_LEAD_DAYS = DEFAULT_LINE_TEMPLATES.number("reminder.visit.lead_days");

/** 提醒訊息共用結尾。後台把它清空就整個不加（連空行也不留）。 */
function withReminderFooter(body: string, t: LineTemplates): string {
  const footer = t.text("reminder.footer").trim();
  return footer ? `${body}\n\n${footer}` : body;
}

/** 本文（不含共用結尾）。提前那則要讓病人「來得及安排」，當天那則要讓他「今天別忘了」——目的不同，措辭也不同。 */
export function visitReminderBody(
  dueDate: string,
  label: string,
  leadDays: number,
  t: LineTemplates = DEFAULT_LINE_TEMPLATES
): string {
  const key = leadDays > 0 ? "reminder.visit.lead" : "reminder.visit.today";
  return t.text(key, { dueDate, label, leadDays });
}

export function visitReminderMessage(
  dueDate: string,
  label: string,
  leadDays: number,
  t: LineTemplates = DEFAULT_LINE_TEMPLATES
): string {
  return withReminderFooter(visitReminderBody(dueDate, label, leadDays, t), t);
}

export function radiotherapyReminderBody(
  dueDate: string,
  fractionNo: number,
  totalFractions: number,
  t: LineTemplates = DEFAULT_LINE_TEMPLATES
): string {
  return t.text("reminder.radiotherapy", { dueDate, fractionNo, totalFractions });
}

export function radiotherapyReminderMessage(
  dueDate: string,
  fractionNo: number,
  totalFractions: number,
  t: LineTemplates = DEFAULT_LINE_TEMPLATES
): string {
  return withReminderFooter(radiotherapyReminderBody(dueDate, fractionNo, totalFractions, t), t);
}

export type PendingPushItem = {
  kind: ReminderKind;
  caseId: string;
  refId: string;
  dueDate: string;
  leadDays: number;
};

export type PendingPush = {
  lineUserId: string;
  /** 已合併好的訊息（多則本文之間空一行，共用結尾只出現一次）。 */
  message: string;
  /** 這一次推播涵蓋的提醒項目，GAS 回報時要逐筆寫進 line_reminder_log。 */
  items: PendingPushItem[];
};

/**
 * 把同一個病人同一天的多則提醒合併成**一次推播**。
 *
 * 為什麼要合併：LINE 的 push 會計入官方帳號的月額度，而 reply（病人主動傳訊時的回覆）不會。
 * 提醒是系統主動發的、沒有 replyToken 可用，只能走 push，所以能省的只有「則數」。
 * 同一人同一天同時有回診與放療時，原本吃 2 則額度，合併後只吃 1 則。
 *
 * 回報仍然是逐筆（items），這樣 line_reminder_log 的唯一索引（kind+ref_id+due_date+lead_days）
 * 才擋得住重複推播——合併只影響「送幾次」，不影響「哪些項目算推過了」。
 */
export function groupRemindersForPush(
  reminders: PendingReminder[],
  t: LineTemplates = DEFAULT_LINE_TEMPLATES
): PendingPush[] {
  const byUser = new Map<string, PendingReminder[]>();
  for (const r of reminders) {
    const list = byUser.get(r.lineUserId);
    if (list) list.push(r);
    else byUser.set(r.lineUserId, [r]);
  }

  return [...byUser.entries()].map(([lineUserId, group]) => ({
    lineUserId,
    message: withReminderFooter(group.map((r) => r.body).join("\n\n"), t),
    items: group.map((r) => ({
      kind: r.kind,
      caseId: r.caseId,
      refId: r.refId,
      dueDate: r.dueDate,
      leadDays: r.leadDays,
    })),
  }));
}

/** date 加減天數，回傳 YYYY-MM-DD。用 UTC 避免跨時區時多跳一天。 */
function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 撈出指定日期該推的提醒。
 * - 回診：`case_schedule_items` 裡 pending、動作含 `visit_reminder`，分兩則——
 *     提前提醒（到期日 = 指定日期 + 3）與 當天提醒（到期日 ≤ 指定日期，逾期一併補推）
 * - 放療：`radiotherapy_sessions` 裡 pending、到期日 = 指定日期（放療是當天的事，隔天才推只會造成困惑）
 * 兩者都只挑**已綁定 LINE**的個案，並排除已經推過的（依 line_reminder_log 的唯一索引，含 lead_days）。
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

  const t = await loadLineTemplates(supabase);
  // 提前天數改成後台可設。設 0 的話 leadDate === date，下面 stages 只會推出當天那則。
  const leadDays = Math.max(0, t.number("reminder.visit.lead_days"));
  const leadDate = shiftDate(date, leadDays);

  const [{ data: visits }, { data: sessions }, { data: alreadySent }] = await Promise.all([
    supabase
      .from("case_schedule_items")
      .select("id, case_id, label, due_date, actions")
      .eq("status", "pending")
      // 一次撈到「已逾期到提前 3 天」這個區間，下面再依各自的 due_date 決定要送哪一則
      .lte("due_date", leadDate)
      .in("case_id", caseIds),
    supabase
      .from("radiotherapy_sessions")
      .select("id, case_id, fraction_no, total_fractions, due_date")
      .eq("status", "pending")
      .eq("due_date", date)
      .in("case_id", caseIds),
    supabase.from("line_reminder_log").select("kind, ref_id, due_date, lead_days").eq("status", "sent"),
  ]);

  const sentKey = new Set(
    (alreadySent ?? []).map((r) => `${r.kind}:${r.ref_id}:${r.due_date}:${r.lead_days ?? 0}`)
  );
  const out: PendingReminder[] = [];

  for (const item of visits ?? []) {
    const actions: string[] = item.actions ?? [];
    if (!actions.includes("visit_reminder")) continue;
    const c = caseById.get(item.case_id)!;

    // 只在 T-N 與 T-0 這兩天推；中間的日子刻意不推，免得變成連環訊息。
    // 提前天數設 0 時 leadDate === date，這時只留當天那則（否則會重複推兩則一樣的）。
    const stages: number[] = [];
    if (leadDays > 0 && item.due_date === leadDate) stages.push(leadDays);
    if (item.due_date <= date) stages.push(0); // 當天，以及逾期未完成的補推

    for (const stage of stages) {
      if (sentKey.has(`visit:${item.id}:${item.due_date}:${stage}`)) continue;
      out.push({
        kind: "visit",
        caseId: item.case_id,
        researchId: c.research_id,
        refId: item.id,
        dueDate: item.due_date,
        leadDays: stage,
        lineUserId: c.line_user_id,
        message: visitReminderMessage(item.due_date, item.label, stage, t),
        body: visitReminderBody(item.due_date, item.label, stage, t),
      });
    }
  }

  for (const s of sessions ?? []) {
    if (sentKey.has(`radiotherapy:${s.id}:${s.due_date}:0`)) continue;
    const c = caseById.get(s.case_id)!;
    out.push({
      kind: "radiotherapy",
      caseId: s.case_id,
      researchId: c.research_id,
      refId: s.id,
      dueDate: s.due_date,
      leadDays: 0,
      lineUserId: c.line_user_id,
      message: radiotherapyReminderMessage(s.due_date, s.fraction_no, s.total_fractions, t),
      body: radiotherapyReminderBody(s.due_date, s.fraction_no, s.total_fractions, t),
    });
  }

  return out;
}
