// 病人自助填寫流程（決策 2026-07-29）。
//
// 範圍原則：只放「病人自己才知道答案」的東西。臨床評分（JSS）、病灶尺寸、
// ICD 診斷、醫學術語、治療紀錄、拍照一律留給診間人員——那些不是病人答得出來的。
//
// 老年友善原則（同日決策）：
//   1. 病人版不出現任何自由文字輸入。細節降到「有／無／不知道」，剩下的進待補清單。
//   2. 選項 ≤ MAX_BUTTONS_PER_PAGE 用大按鈕；範圍大的（時間、年份、時數）才用履帶。
//   3. 一頁的題數由「選項數 × 題數」自動算，不寫死。

export const PATIENT_INTAKE_SEGMENTS = [
  { key: "basic", label: "基本資料", hint: "性別、出生日期、身高體重、聯絡電話" },
  { key: "history", label: "過去病史", hint: "家族史、蟹足腫病史、以前做過的治療" },
  { key: "intake_options", label: "就診資訊", hint: "怎麼發生的、怎麼知道要來看診" },
  { key: "sf36", label: "健康狀況", hint: "SF-36 健康調查" },
  { key: "psqi", label: "睡眠品質", hint: "PSQI 睡眠品質量表" },
] as const;

export type PatientIntakeSegmentKey = (typeof PATIENT_INTAKE_SEGMENTS)[number]["key"];

/** 這兩份問卷是病人自評量表，放進病人流程；JSS 是醫師評分，刻意不放。 */
export const SEGMENT_QUESTIONNAIRE_NAME: Partial<Record<PatientIntakeSegmentKey, string>> = {
  sf36: "SF-36 健康調查簡表",
  psqi: "匹茲堡睡眠品質量表（PSQI）",
};

/**
 * 待補項目（case_intake_followups.field_key）屬於哪一段（2026-08-25）。
 *
 * 填完之後回頭檢視時，要能一段一段告訴人員「這一段還有哪幾題沒答」——
 * 而「沒答」這件事在存檔當下就已經算好、寫進待補清單了，不必再推導一次。
 * 沒列在這裡的 field_key（例如診間免除的 lesion_*）不屬於病人自填流程，不顯示。
 */
export const FOLLOWUP_SEGMENT: Record<string, PatientIntakeSegmentKey> = {
  sex: "basic",
  age: "basic",
  height: "basic",
  weight: "basic",
  phone: "basic",
  family_history: "history",
  keloid_onset_date: "history",
  visit_reason: "history",
  prior_treatment_physician: "history",
  prior_steroid_treatment: "history",
  prior_tcm_treatment: "history",
  prior_ogawa_patch: "history",
  prior_radiation_treatment: "history",
  onset_cause: "intake_options",
  referral_source: "intake_options",
  keloid_symptom: "intake_options",
  questionnaire_sf36: "sf36",
  questionnaire_psqi: "psqi",
};

/**
 * 每頁的「按鈕預算」。6 選項題配上 56px 大按鈕加題目，一頁就滿了；
 * 是／否題一頁只放一題則會變成二十幾頁空白畫面。用總按鈕數當預算兩邊都顧到。
 */
export const MAX_BUTTONS_PER_PAGE = 10;

/**
 * 題號的群組鍵：SF-36 / PSQI 的子題編號是 `3a.` `9b.` `11c.` 這種格式，
 * 同一個數字代表同一題組（共用題幹），儘量讓它們待在同一頁。
 * 抓不到編號就自成一組。
 */
export function questionGroupKey(questionText: string, fallback: string | number): string {
  const m = questionText.match(/^\s*(\d+)[a-z]?[.．]/);
  return m ? `g${m[1]}` : `s${fallback}`;
}

export type PageableQuestion = {
  id: string;
  order_no: number;
  question_text: string;
  question_type: string;
  options: { value: string; label: string }[];
  required: boolean;
};

/** 一題在畫面上佔幾個「按鈕」。非選項題（時間、時數）用履帶，估 3 個按鈕的高度。 */
function buttonCost(q: PageableQuestion): number {
  if (q.question_type === "single" || q.question_type === "multi" || q.question_type === "scale") {
    return Math.max(1, q.options.length);
  }
  return 3;
}

/**
 * 依「選項數 × 題數」把題目自動切頁：同題組優先待在一起，超過預算就在題組內再切。
 * 單一題本身就超過預算（例如 6 選項）時自成一頁——那本來就只能一頁一題。
 */
export function paginateQuestions(questions: PageableQuestion[], budget = MAX_BUTTONS_PER_PAGE): PageableQuestion[][] {
  const pages: PageableQuestion[][] = [];
  let page: PageableQuestion[] = [];
  let used = 0;
  let currentGroup: string | null = null;

  for (const q of questions) {
    const group = questionGroupKey(q.question_text, q.order_no);
    const cost = buttonCost(q);
    const groupChanged = currentGroup !== null && group !== currentGroup;

    if (page.length > 0 && (groupChanged || used + cost > budget)) {
      pages.push(page);
      page = [];
      used = 0;
    }

    page.push(q);
    used += cost;
    currentGroup = group;
  }

  if (page.length > 0) pages.push(page);
  return pages;
}
