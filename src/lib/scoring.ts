// 標準化問卷計分邏輯：SF-36（RAND 36-Item Health Survey 1.0 公版計分法）與匹茲堡睡眠品質量表 PSQI。
// 皆依 order_no（對應 supabase/migrations/20260727030000_sf36_psqi_questionnaires_seed.sql 的子題編號）取值計算，
// 不依賴題目文字，只要 order_no 對應關係不變，題目文字調整不影響計分。

export type AnswerMap = Record<number, unknown>;

// ---------- SF-36 ----------
// 資料來源：RAND Corporation, "36-Item Short Form Survey (SF-36) Scoring Instructions"
// (https://www.rand.org/health-care/surveys_tools/mos/36-item-short-form/scoring.html) Table 1 / Table 2。

const SF36_RECODE_GROUPS: { items: number[]; map: Record<number, number> }[] = [
  { items: [1, 2, 20, 22, 34, 36], map: { 1: 100, 2: 75, 3: 50, 4: 25, 5: 0 } },
  { items: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12], map: { 1: 0, 2: 50, 3: 100 } },
  { items: [13, 14, 15, 16, 17, 18, 19], map: { 1: 0, 2: 100 } },
  { items: [21, 23, 26, 27, 30], map: { 1: 100, 2: 80, 3: 60, 4: 40, 5: 20, 6: 0 } },
  { items: [24, 25, 28, 29, 31], map: { 1: 0, 2: 20, 3: 40, 4: 60, 5: 80, 6: 100 } },
  { items: [32, 33, 35], map: { 1: 0, 2: 25, 3: 50, 4: 75, 5: 100 } },
];

export const SF36_SCALES = [
  { key: "physical_functioning", label: "生理功能", items: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { key: "role_physical", label: "生理健康引起的角色限制", items: [13, 14, 15, 16] },
  { key: "role_emotional", label: "情緒問題引起的角色限制", items: [17, 18, 19] },
  { key: "energy_fatigue", label: "活力/疲勞", items: [23, 27, 29, 31] },
  { key: "emotional_wellbeing", label: "情緒健康", items: [24, 25, 26, 28, 30] },
  { key: "social_functioning", label: "社交功能", items: [20, 32] },
  { key: "pain", label: "身體疼痛", items: [21, 22] },
  { key: "general_health", label: "一般健康感受", items: [1, 33, 34, 35, 36] },
] as const;

function recodeSF36Item(orderNo: number, rawValue: unknown): number | null {
  const raw = Number(rawValue);
  if (!Number.isFinite(raw)) return null;
  const group = SF36_RECODE_GROUPS.find((g) => g.items.includes(orderNo));
  if (!group) return null;
  return group.map[raw] ?? null;
}

export interface SF36ScaleResult {
  key: string;
  label: string;
  score: number | null; // 0-100，缺題時以已答題目平均（RAND 官方規則）
  answeredCount: number;
  totalItems: number;
}

export function computeSF36(answers: AnswerMap): { scales: SF36ScaleResult[] } {
  const scales = SF36_SCALES.map((scale) => {
    const recoded = scale.items
      .map((orderNo) => recodeSF36Item(orderNo, answers[orderNo]))
      .filter((v): v is number => v !== null);
    const score = recoded.length > 0 ? recoded.reduce((s, v) => s + v, 0) / recoded.length : null;
    return {
      key: scale.key,
      label: scale.label,
      score: score !== null ? Math.round(score * 10) / 10 : null,
      answeredCount: recoded.length,
      totalItems: scale.items.length,
    };
  });
  return { scales };
}

// ---------- PSQI ----------
// 資料來源：Buysse et al. 1989 匹茲堡睡眠品質量表原始計分演算法（7 面向各 0-3 分，總分 0-21 分，>5 分視為睡眠品質不佳）。
// 限制：本平台第5j題（其他睡眠困擾原因）僅收文字說明，未收 0-3 頻率評分，故「睡眠困擾」面向的加總只涵蓋 5b-5i 共8小題
// （官方為5b-5j共9小題），會使極少數重度個案的睡眠困擾分數略為低估，其餘6個面向不受影響。
// 第10、11題（睡伴／室友狀況與睡伴觀察到的情形，order_no 19-24）在原始演算法中就不計分，只作睡眠呼吸中止／
// 肢動症的篩檢資訊，這裡刻意不取用。

function parseLeadingNumber(text: unknown): number | null {
  if (typeof text === "number") return Number.isFinite(text) ? text : null;
  if (typeof text !== "string") return null;
  const m = text.match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function parseClockMinutes(text: unknown): number | null {
  if (typeof text !== "string") return null;
  const m = text.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export interface PSQIComponentResult {
  key: string;
  label: string;
  score: number | null; // 0-3
}

export interface PSQIResult {
  components: PSQIComponentResult[];
  global: number | null; // 0-21，任一面向缺資料則為 null（不用 0 頂替，避免低估）
  poorSleep: boolean | null; // global > 5
  sleepEfficiencyPct: number | null;
}

export function computePSQI(answers: AnswerMap): PSQIResult {
  const num = (orderNo: number): number | null => {
    const v = answers[orderNo];
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // C1 主觀睡眠品質：Q6（order_no 15），已是 0-3
  const c1 = num(15);

  // C2 睡眠潛伏期：Q2 入睡分鐘數（order_no 2）分級 + Q5a（order_no 5，0-3），加總後再分級
  const minutesToSleep = num(2);
  const q5a = num(5);
  const latencyRecode = minutesToSleep === null ? null : minutesToSleep <= 15 ? 0 : minutesToSleep <= 30 ? 1 : minutesToSleep <= 60 ? 2 : 3;
  const c2 = latencyRecode === null || q5a === null ? null : bucket(latencyRecode + q5a, [0, 2, 4]);

  // C3 睡眠時數：Q4（order_no 4，文字，取數字部分為小時數）
  const hoursSlept = parseLeadingNumber(answers[4]);
  const c3 = hoursSlept === null ? null : hoursSlept >= 7 ? 0 : hoursSlept >= 6 ? 1 : hoursSlept >= 5 ? 2 : 3;

  // C4 習慣性睡眠效率：(實際睡眠時數 / 臥床時數) x 100，臥床時數 = 起床時間(Q3) - 上床時間(Q1)
  const bedMin = parseClockMinutes(answers[1]);
  const riseMin = parseClockMinutes(answers[3]);
  let sleepEfficiencyPct: number | null = null;
  let c4: number | null = null;
  if (bedMin !== null && riseMin !== null && hoursSlept !== null) {
    let timeInBedMin = riseMin - bedMin;
    if (timeInBedMin <= 0) timeInBedMin += 24 * 60;
    const timeInBedHours = timeInBedMin / 60;
    if (timeInBedHours > 0) {
      sleepEfficiencyPct = (hoursSlept / timeInBedHours) * 100;
      c4 = sleepEfficiencyPct >= 85 ? 0 : sleepEfficiencyPct >= 75 ? 1 : sleepEfficiencyPct >= 65 ? 2 : 3;
    }
  }

  // C5 睡眠困擾：Q5b-5i 加總（order_no 6-13，本平台未收 5j 頻率評分，見上方限制說明）
  const disturbanceOrders = [6, 7, 8, 9, 10, 11, 12, 13];
  const disturbanceValues = disturbanceOrders.map(num).filter((v): v is number => v !== null);
  const c5 = disturbanceValues.length === disturbanceOrders.length ? bucket(disturbanceValues.reduce((s, v) => s + v, 0), [0, 9, 18]) : null;

  // C6 安眠藥物使用：Q7（order_no 16），已是 0-3
  const c6 = num(16);

  // C7 日間功能障礙：Q8 + Q9（order_no 17, 18）加總後分級
  const q8 = num(17);
  const q9 = num(18);
  const c7 = q8 === null || q9 === null ? null : bucket(q8 + q9, [0, 2, 4]);

  const components: PSQIComponentResult[] = [
    { key: "sleep_quality", label: "主觀睡眠品質", score: c1 },
    { key: "sleep_latency", label: "睡眠潛伏期", score: c2 },
    { key: "sleep_duration", label: "睡眠時數", score: c3 },
    { key: "sleep_efficiency", label: "睡眠效率", score: c4 },
    { key: "sleep_disturbance", label: "睡眠困擾", score: c5 },
    { key: "sleep_medication", label: "安眠藥物使用", score: c6 },
    { key: "daytime_dysfunction", label: "日間功能障礙", score: c7 },
  ];

  const hasAllComponents = components.every((c) => c.score !== null);
  const global = hasAllComponents ? components.reduce((s, c) => s + (c.score as number), 0) : null;
  const poorSleep = global === null ? null : global > 5;

  return { components, global, poorSleep, sleepEfficiencyPct };
}

// 依累進門檻分級：值 <= thresholds[0] → 0；<= thresholds[1] → 1；<= thresholds[2] → 2；否則 → 3
function bucket(value: number, thresholds: [number, number, number]): number {
  if (value <= thresholds[0]) return 0;
  if (value <= thresholds[1]) return 1;
  if (value <= thresholds[2]) return 2;
  return 3;
}

// ---------- JSS 疤痕量表（JSW Scar Scale, 2015 版）----------
// 選項 value 本身就是計分點數，直接加總即為總分，不需重新編碼。
// 2026-07-27 決策：原本另有一份 6 題的「JSS 症狀與治療追蹤評估表」，已刪除只留這份正式量表；
// 追蹤改為同一份量表重複施測（疤痕量表的標準用法），Delta Score 以歷次總分相減計算。

function sumOrders(answers: AnswerMap, orders: number[]): number | null {
  const values = orders
    .map((o) => {
      const n = Number(answers[o]);
      return Number.isFinite(n) ? n : null;
    })
    .filter((v): v is number => v !== null);
  if (values.length !== orders.length) return null;
  return values.reduce((s, v) => s + v, 0);
}

export interface JSSClassificationResult {
  total: number; // 0-25
}

// JSW Scar Scale（JSS 2015）診斷分類表：12 項，選項 value 即分數，加總為總分（0-25），分數越高越偏向蟹足腫。
// 依規格文件僅回報總分，不做自動分類（文件未提供分類切點，分類由臨床判讀）。
export function computeJSSClassification(answers: AnswerMap): JSSClassificationResult | null {
  const total = sumOrders(answers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  if (total === null) return null;
  return { total };
}

