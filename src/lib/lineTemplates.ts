// LINE bot 所有對外文案與行為參數的**唯一登錄處**（2026-07-30）。
//
// 設計：資料表 `line_message_templates` 只存「被改過的那幾則」（override），
// 沒有被改過的一律用這裡的預設值。這麼做的理由：
//   ① 不必寫 seed migration，也就不會有「程式改了、資料庫沒跟上」的漂移
//   ② 新增一則文案只要動這個檔案，後台自動長出欄位
//   ③ 資料庫撈不到（連線失敗、表還沒建）時 bot 照樣回得了話，不會啞掉 — 這對推播型服務是硬需求
//   ④ 「恢復預設」＝刪掉那一列，不需要記得原文是什麼
//
// 刻意**不**開放編輯的東西：
//   - KB_TOPIC_PREFIX / KB_CATEGORY_PREFIX（按鈕送出的文字前綴，是協定不是文案，
//     改了會讓病人手機上還沒點的舊按鈕全部失效）
//   - Gemini 的 5 條安全規則（見 ai.tone 的 lockedSuffix，決策 2026-07-26 的 IRB 前提）

import type { SupabaseClient } from "@supabase/supabase-js";

export type LineTemplateGroupKey = "reminder" | "bind" | "menu" | "ai";

export const LINE_TEMPLATE_GROUPS: { key: LineTemplateGroupKey; label: string; description: string }[] = [
  {
    key: "reminder",
    label: "提醒推播",
    description: "系統主動推給病人的回診／放療提醒。改動會影響之後每一次推播，送出前請先看預覽。",
  },
  {
    key: "bind",
    label: "加好友與綁定",
    description: "病人加官方帳號、輸入綁定碼時看到的回覆。",
  },
  {
    key: "menu",
    label: "衛教選單",
    description: "病人叫出衛教主題選單時的提示語與按鈕文字。衛教內容本身在「LINE 衛教機器人內容」維護。",
  },
  {
    key: "ai",
    label: "自由提問（AI 回應）",
    description: "病人自己打字提問時的回應方式。安全規則不開放修改。",
  },
];

export type LineTemplateVar = { name: string; desc: string; sample: string };

export type LineTemplateDef = {
  key: string;
  group: LineTemplateGroupKey;
  label: string;
  description: string;
  /** text＝單行、multiline＝多行、number＝數字、list＝逗號分隔的清單 */
  kind: "text" | "multiline" | "number" | "list";
  defaultValue: string;
  vars?: LineTemplateVar[];
  /** 顯示在編輯框下方、但不可修改的內容（目前只有 Gemini 的安全規則用到）。 */
  lockedSuffix?: string;
};

/** Gemini 改寫語氣時一定會帶上的規則。決策 2026-07-26 的護欄，不開放後台修改。 */
export const AI_SAFETY_RULES = `規則：
- 只能根據這則內容回答，不可以加入任何資料庫以外的醫學知識或自行推論
- 不要更動任何數字（天數、時數、劑量、溫度）
- 不要要求或記錄病人的個人資料（姓名、病歷號、聯絡方式等）
- 3-6 行以內，不要條列超過 5 點`;

const V = {
  dueDate: { name: "dueDate", desc: "到期日（YYYY-MM-DD）", sample: "2026-08-11" },
  label: { name: "label", desc: "追蹤時間點名稱", sample: "術後 1 個月" },
  leadDays: { name: "leadDays", desc: "還有幾天", sample: "3" },
  fractionNo: { name: "fractionNo", desc: "第幾次療程", sample: "2" },
  totalFractions: { name: "totalFractions", desc: "總共幾次", sample: "3" },
  category: { name: "category", desc: "衛教分類名稱", sample: "傷口照顧" },
  keyword: { name: "keyword", desc: "叫出選單的第一個關鍵字", sample: "衛教" },
} satisfies Record<string, LineTemplateVar>;

export const LINE_TEMPLATES: LineTemplateDef[] = [
  // ── 提醒推播 ────────────────────────────────────────────────
  {
    key: "reminder.visit.lead_days",
    group: "reminder",
    label: "回診提醒提前幾天",
    description:
      "除了當天那則之外，提前幾天先推一次。設 0 代表只推當天那則。中間的日子刻意不推，避免變成連環訊息。",
    kind: "number",
    defaultValue: "3",
  },
  {
    key: "reminder.visit.lead",
    group: "reminder",
    label: "回診提醒（提前那則）",
    description: "目的是讓病人「來得及安排」，所以要講還有幾天、以及不方便可以改期。",
    kind: "multiline",
    vars: [V.dueDate, V.label, V.leadDays],
    defaultValue: [
      "【回診提醒】",
      "提醒您，{{dueDate}}（{{label}}）安排了回診，還有 {{leadDays}} 天。",
      "若當天不方便，請提前與診間聯繫改期。",
    ].join("\n"),
  },
  {
    key: "reminder.visit.today",
    group: "reminder",
    label: "回診提醒（當天那則）",
    description: "目的是讓病人「今天別忘了」，措辭跟提前那則不同。逾期未完成的項目也會補推這一則。",
    kind: "multiline",
    vars: [V.dueDate, V.label],
    defaultValue: [
      "【今日回診提醒】",
      "今天是您預定回診的日子（{{label}}）。",
      "請記得前來，若臨時無法前往請與診間聯繫。",
    ].join("\n"),
  },
  {
    key: "reminder.radiotherapy",
    group: "reminder",
    label: "放射治療提醒",
    description: "放療只推當天（隔天才推只會造成困惑）。",
    kind: "multiline",
    vars: [V.dueDate, V.fractionNo, V.totalFractions],
    defaultValue: [
      "【放射治療提醒】",
      "今天（{{dueDate}}）是您療程的第 {{fractionNo}} 次，共 {{totalFractions}} 次。",
      "放射治療需要連續完成才有效果，請務必準時前往。",
    ].join("\n"),
  },
  {
    key: "reminder.footer",
    group: "reminder",
    label: "提醒訊息共用結尾",
    description: "所有提醒訊息的最後一行。留空就不加。提醒訊息刻意不含研究編號／部位／病歷號，因為可能被家人看到。",
    kind: "text",
    defaultValue: "（此為自動提醒，請勿直接回覆此訊息以外的個人資料）",
  },

  // ── 加好友與綁定 ─────────────────────────────────────────────
  {
    key: "bind.welcome",
    group: "bind",
    label: "加好友歡迎詞",
    description: "病人剛加官方帳號好友、系統還不知道他是誰的時候發出。",
    kind: "multiline",
    defaultValue: [
      "您好，這裡是蟹足腫研究團隊的通知帳號。",
      "",
      "請輸入診間提供的綁定碼（或直接掃描診間給您的 QR code），完成後就會在這裡收到回診與治療提醒。",
      "也可以直接輸入問題詢問傷口照顧的衛教內容。",
    ].join("\n"),
  },
  {
    key: "bind.success",
    group: "bind",
    label: "綁定成功",
    kind: "multiline",
    description: "綁定碼比對成功、寫入完成後的回覆。",
    defaultValue: [
      "綁定完成！",
      "之後回診與放射治療的提醒會透過這裡通知您。",
      "",
      "您也可以直接輸入問題詢問傷口照顧相關的衛教內容。",
    ].join("\n"),
  },
  {
    key: "bind.code_invalid",
    group: "bind",
    label: "綁定碼不正確",
    description: "查無這組碼。",
    kind: "text",
    defaultValue: "綁定碼不正確，請確認診間提供的內容，或請診間重新產生一組。",
  },
  {
    key: "bind.code_expired",
    group: "bind",
    label: "綁定碼已逾期",
    description: "綁定碼預設 72 小時有效（BIND_CODE_TTL_HOURS），過期可在個案頁重新產生。",
    kind: "text",
    defaultValue: "這組綁定碼已逾期，請洽診間重新產生。",
  },
  {
    key: "bind.already_bound",
    group: "bind",
    label: "這支 LINE 已綁過別的個案",
    description: "同一個 LINE 帳號不能綁兩個個案（資料庫有唯一索引），換手機或換人要先請診間解除。",
    kind: "text",
    defaultValue: "這個 LINE 帳號已經完成過綁定。若需要更換，請洽診間協助解除後再重新綁定。",
  },
  {
    key: "bind.failed",
    group: "bind",
    label: "綁定寫入失敗",
    description: "資料庫寫入出錯時的回覆。",
    kind: "text",
    defaultValue: "綁定時發生問題，請稍後再試或洽診間協助。",
  },
  {
    key: "bind.empty_text",
    group: "bind",
    label: "收到空訊息",
    description: "病人送出貼圖、照片等非文字內容時。",
    kind: "text",
    defaultValue: "請直接輸入您的問題，或輸入診間提供的綁定碼完成綁定。",
  },

  // ── 衛教選單 ────────────────────────────────────────────────
  {
    key: "menu.keywords",
    group: "menu",
    label: "叫出選單的關鍵字",
    description:
      "病人打這些字（要完全相同，不是包含）就會直接看到主題選單，不會送去 AI。以逗號分隔。第一個會被當成提示語裡的建議用字。",
    kind: "list",
    defaultValue: "衛教, 選單, 諮詢, 主題, menu",
  },
  {
    key: "menu.prompt.single",
    group: "menu",
    label: "選單提示語（單層時）",
    description: "衛教則數還塞得進一則訊息時，直接列主題按鈕。",
    kind: "text",
    defaultValue: "請點選您想了解的主題，或直接輸入問題：",
  },
  {
    key: "menu.prompt.grouped",
    group: "menu",
    label: "選單提示語（分兩層時）",
    description: "衛教則數超過 13 且分類有兩個以上時，第一層改成分類按鈕。",
    kind: "text",
    defaultValue: "請先點選您想了解的類別，或直接輸入問題：",
  },
  {
    key: "menu.prompt.category",
    group: "menu",
    label: "選單提示語（點進某個分類後）",
    kind: "text",
    description: "兩層模式的第二層。",
    vars: [V.category],
    defaultValue: "【{{category}}】請點選您想了解的主題，或直接輸入問題：",
  },
  {
    key: "menu.empty",
    group: "menu",
    label: "尚無衛教內容",
    description: "後台一則已啟用的衛教都沒有時。",
    kind: "text",
    defaultValue: "目前尚無衛教內容，請洽詢診間人員。",
  },
  {
    key: "menu.hint",
    group: "menu",
    label: "回選單的提示行",
    description:
      "Quick Reply 按鈕只附在「那一則」回覆上，病人再打一句話按鈕就沒了。這行固定加在主題回覆與 AI 回覆的結尾，留一條回去的路。留空就不加。",
    kind: "text",
    vars: [V.keyword],
    defaultValue: "（輸入「{{keyword}}」可隨時叫出衛教主題選單）",
  },
  {
    key: "menu.back_label",
    group: "menu",
    label: "返回鈕文字",
    description: "兩層模式下，主題選單最後一顆按鈕。LINE 的按鈕文字上限 20 字元。",
    kind: "text",
    defaultValue: "⬅ 其他分類",
  },
  {
    key: "menu.uncategorized",
    group: "menu",
    label: "未分類的分類名稱",
    description: "衛教內容沒填分類時歸在這個名字底下，不會從選單消失。",
    kind: "text",
    defaultValue: "其他",
  },

  // ── 自由提問 ────────────────────────────────────────────────
  {
    key: "ai.no_match",
    group: "ai",
    label: "資料庫查無相關內容",
    description:
      "最常被觸發的一則。決策 2026-07-26：衛教資料庫沒涵蓋的問題一律請病人洽詢診間，不讓 AI 自由發揮醫學建議。",
    kind: "multiline",
    defaultValue: "這個問題建議您洽詢診間人員，我們會盡快協助您。",
  },
  {
    key: "ai.error",
    group: "ai",
    label: "AI 暫時無法回應",
    description:
      "免費層額度用完、被限流、或連不上 Gemini 時用這則。刻意跟「查無相關內容」分開——" +
      "兩者混用的話，額度爆掉時每個提問都會被推去診間，而且誰也看不出來是壞掉還是真的沒這題。" +
      "發生時會寫進 LINE 紀錄頁的「機器人錯誤」。",
    kind: "multiline",
    defaultValue: "抱歉，衛教小幫手暫時無法回答，請稍後再試一次。\n若有急需，請直接洽詢診間人員。",
  },
  {
    key: "ai.tone",
    group: "ai",
    label: "AI 回應語氣",
    description:
      "比對到衛教內容之後，AI 會照這段指示改寫語氣再回給病人。只影響「怎麼講」，不影響「講什麼」——內容一律來自衛教資料庫。",
    kind: "multiline",
    defaultValue: "你是蟹足腫衛教機器人。請用親切、簡短、口語的方式，把下面這則衛教內容說給病人聽。",
    lockedSuffix: AI_SAFETY_RULES,
  },
  {
    key: "ai.no_api_key",
    group: "ai",
    label: "未設定 AI 金鑰",
    description: "GEMINI_API_KEY 環境變數沒設定時的回覆。設定好之後病人不會看到這則。",
    kind: "text",
    defaultValue: "尚未設定 Gemini API 金鑰（環境變數 GEMINI_API_KEY），請聯繫系統管理者設定。",
  },
];

export const LINE_TEMPLATE_BY_KEY = new Map(LINE_TEMPLATES.map((d) => [d.key, d]));

/** `{{name}}` 代換。找不到的變數原樣保留，這樣後台打錯字時看預覽就會發現。 */
export function renderTemplate(value: string, vars?: Record<string, string | number>): string {
  if (!vars) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole
  );
}

/** 用每個變數的範例值套出來的樣子，給後台預覽用。 */
export function previewTemplate(def: LineTemplateDef, value: string): string {
  const vars = Object.fromEntries((def.vars ?? []).map((v) => [v.name, v.sample]));
  return renderTemplate(value, vars);
}

export function parseTemplateList(value: string): string[] {
  return value
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type LineTemplates = {
  /** 原始字串（未代換變數）。 */
  raw(key: string): string;
  /** 代換變數後的字串。 */
  text(key: string, vars?: Record<string, string | number>): string;
  number(key: string): number;
  list(key: string): string[];
  /** 這一則有沒有被後台改過（後台用來顯示「已修改」標記）。 */
  isOverridden(key: string): boolean;
};

function defaultOf(key: string): string {
  const def = LINE_TEMPLATE_BY_KEY.get(key);
  if (!def) throw new Error(`未登錄的 LINE 文案 key：${key}`);
  return def.defaultValue;
}

export function makeLineTemplates(overrides: Record<string, string>): LineTemplates {
  const raw = (key: string) => {
    const o = overrides[key];
    // 空字串是有意義的（例如把結尾整行拿掉），所以只有「沒有這一列」才回退預設。
    return o === undefined ? defaultOf(key) : o;
  };
  return {
    raw,
    text: (key, vars) => renderTemplate(raw(key), vars),
    number: (key) => {
      const n = Number(raw(key).trim());
      return Number.isFinite(n) ? Math.trunc(n) : Number(defaultOf(key));
    },
    list: (key) => {
      const items = parseTemplateList(raw(key));
      return items.length > 0 ? items : parseTemplateList(defaultOf(key));
    },
    isOverridden: (key) => overrides[key] !== undefined,
  };
}

export const DEFAULT_LINE_TEMPLATES = makeLineTemplates({});

/**
 * 從資料庫載入被改過的文案。
 * **撈不到就回預設值**——bot 不能因為某天資料表讀不到就不回話。
 */
export async function loadLineTemplates(supabase: SupabaseClient): Promise<LineTemplates> {
  const { data, error } = await supabase.from("line_message_templates").select("key, content");
  if (error || !data) return DEFAULT_LINE_TEMPLATES;
  const overrides: Record<string, string> = {};
  for (const row of data) {
    // 已經從登錄檔移除的 key（例如文案改版）留在資料表裡不會壞事，直接忽略。
    if (LINE_TEMPLATE_BY_KEY.has(row.key)) overrides[row.key] = row.content ?? "";
  }
  return makeLineTemplates(overrides);
}
