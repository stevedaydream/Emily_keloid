// 標準化問卷計分邏輯：SF-36（RAND 36-Item Health Survey 1.0 公版計分法）與匹茲堡睡眠品質量表 PSQI。
// 皆依 order_no（對應 supabase/migrations/20260727030000_sf36_psqi_questionnaires_seed.sql 的子題編號）取值計算，
// 不依賴題目文字，只要 order_no 對應關係不變，題目文字調整不影響計分。

export type AnswerMap = Record<number, unknown>;

// ---------- SF-36 ----------
// 計分依據：docs/生活品質量表及睡眠量表計分.docx（2026-08-20 使用者提供，此為本研究的最終計分方式）
//
//   每一構面分數 =（該構面實際得分 － 該構面可能最低得分）／該構面分數範圍 × 100
//
// 「實際得分」是構面內各題**轉正後**的原始分加總（轉正＝把「1 分最健康」的反向題翻過來，
// 讓所有題目都是分數越高越健康）；「可能最低得分」＝題數（每題最低 1 分）；
// 「分數範圍」＝各題層級數加總 － 題數。
//
// 與先前實作的差異：舊版走 RAND 的「每題各自換算 0-100 再平均」。兩者在「構面內各題層級數相同」時
// 數學上完全等價，只有「身體疼痛」構面會不同（見下方第8題的條件式換算）。
//
// 構面組成與 docx 的對照表一致（3a-3j／4a-4d／7+8／1+11a-11d／9a,9e,9g,9i／6+10／5a-5c／9b,9c,9d,9f,9h），
// 八個構面推導出的最低／最高／範圍也與對照表逐格相符。

/**
 * 每題的作答層級數，以及原始值 1 是不是「最健康」的答案。
 * bestAtOne = true 的題目在加總前要反向（oriented = levels + 1 − raw）。
 * 第22題（第8題疼痛干擾）不在這裡，它是條件式換算，見 orientPainInterference。
 */
const SF36_ITEM_SPECS: { items: number[]; levels: number; bestAtOne: boolean }[] = [
  { items: [1, 2, 20, 34, 36], levels: 5, bestAtOne: true },
  { items: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12], levels: 3, bestAtOne: false },
  { items: [13, 14, 15, 16, 17, 18, 19], levels: 2, bestAtOne: false },
  { items: [21, 23, 26, 27, 30], levels: 6, bestAtOne: true },
  { items: [24, 25, 28, 29, 31], levels: 6, bestAtOne: false },
  { items: [32, 33, 35], levels: 5, bestAtOne: false },
];

const SF36_PAIN_SEVERITY_ORDER = 21; // 第7題：疼痛程度（6 選項）
const SF36_PAIN_INTERFERENCE_ORDER = 22; // 第8題：疼痛干擾工作（5 選項）

/**
 * 第8題是 SF-36 唯一的條件式換算題：選項只有 5 個，但轉正後要展開成 1-6 分，
 * 而且「完全沒有影響」是 6 還是 5，取決於第7題有沒有疼痛。
 *
 *   第8題=1 且 第7題=1（完全沒有疼痛）→ 6      第8題=1 且 第7題≥2 → 5
 *   第8題=2 → 4    =3 → 3    =4 → 2    =5 → 1
 *   第7題未作答時：1→6、2→4.75、3→3.5、4→2.25、5→1
 *
 * 這正是 docx 對照表把「身體疼痛」寫成最低2／最高12／範圍10 的原因——不是對照表算錯，
 * 是第8題轉正後本來就是 6 級。改成這個換算後，八個構面的最低／最高／範圍與對照表完全一致。
 * （RAND 版把第8題當單純 5 級處理，所以這裡與舊實作會有差；本問卷是台灣/IQOLA 版，依 docx 為準。）
 */
function orientPainInterference(raw: number, severityRaw: number | null): number | null {
  if (!Number.isInteger(raw) || raw < 1 || raw > 5) return null;
  if (severityRaw === null) return [6, 4.75, 3.5, 2.25, 1][raw - 1];
  if (raw === 1) return severityRaw === 1 ? 6 : 5;
  return 6 - raw;
}

export const SF36_SCALES = [
  { key: "physical_functioning", label: "生理功能", docLabel: "身體功能", items: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { key: "role_physical", label: "生理健康引起的角色限制", docLabel: "活動限制", items: [13, 14, 15, 16] },
  { key: "role_emotional", label: "情緒問題引起的角色限制", docLabel: "情緒限制", items: [17, 18, 19] },
  { key: "energy_fatigue", label: "活力/疲勞", docLabel: "活力狀況", items: [23, 27, 29, 31] },
  { key: "emotional_wellbeing", label: "情緒健康", docLabel: "心理健康", items: [24, 25, 26, 28, 30] },
  { key: "social_functioning", label: "社交功能", docLabel: "社會功能", items: [20, 32] },
  { key: "pain", label: "身體疼痛", docLabel: "身體疼痛", items: [21, 22] },
  { key: "general_health", label: "一般健康感受", docLabel: "自覺健康", items: [1, 33, 34, 35, 36] },
] as const;

/**
 * docx 對照表原文（最低／最高／範圍），供後台驗算頁面跟程式實際推導值逐格比對。
 * 不參與計分——計分一律用各題的轉正範圍推導；兩者對不上時驗算頁面會出警告，
 * 那就是問卷選項或計分規則被改動、跟研究文件脫鉤的信號。
 */
export const SF36_DOC_TABLE: Record<string, { min: number; max: number; range: number }> = {
  physical_functioning: { min: 10, max: 30, range: 20 },
  role_physical: { min: 4, max: 8, range: 4 },
  pain: { min: 2, max: 12, range: 10 },
  general_health: { min: 5, max: 25, range: 20 },
  energy_fatigue: { min: 4, max: 24, range: 20 },
  social_functioning: { min: 2, max: 10, range: 8 },
  role_emotional: { min: 3, max: 6, range: 3 },
  emotional_wellbeing: { min: 5, max: 30, range: 25 },
};

function sf36ItemSpec(orderNo: number) {
  return SF36_ITEM_SPECS.find((g) => g.items.includes(orderNo)) ?? null;
}

export interface SF36ItemDetail {
  orderNo: number;
  raw: number | null;
  /** 轉正後的分數（1 = 最不健康，levels = 最健康）；未作答或超出選項範圍為 null */
  oriented: number | null;
  levels: number;
  reversed: boolean;
  /** 第8題那種「換算要看另一題」的條件式題目 */
  conditional: boolean;
}

export interface SF36ScaleResult {
  key: string;
  label: string;
  score: number | null; // 0-100
  answeredCount: number;
  totalItems: number;
  /** 以下為驗算用的中間值，只涵蓋「已作答」的題目 */
  sum: number | null;
  min: number | null;
  range: number | null;
  details: SF36ItemDetail[];
}

export function computeSF36(answers: AnswerMap): { scales: SF36ScaleResult[] } {
  const scales = SF36_SCALES.map((scale) => {
    const details: SF36ItemDetail[] = scale.items.map((orderNo) => {
      const raw = Number(answers[orderNo]);
      const rawOrNull = Number.isFinite(raw) ? raw : null;

      if (orderNo === SF36_PAIN_INTERFERENCE_ORDER) {
        const severity = Number(answers[SF36_PAIN_SEVERITY_ORDER]);
        return {
          orderNo,
          raw: rawOrNull,
          oriented: rawOrNull === null ? null : orientPainInterference(rawOrNull, Number.isFinite(severity) ? severity : null),
          levels: 6, // 選項 5 個，轉正後展開成 1-6
          reversed: true,
          conditional: true,
        };
      }

      const spec = sf36ItemSpec(orderNo);
      const valid = spec !== null && rawOrNull !== null && rawOrNull >= 1 && rawOrNull <= spec.levels;
      return {
        orderNo,
        raw: rawOrNull,
        oriented: valid ? (spec.bestAtOne ? spec.levels + 1 - (rawOrNull as number) : rawOrNull) : null,
        levels: spec?.levels ?? 0,
        reversed: spec?.bestAtOne ?? false,
        conditional: false,
      };
    });

    // 缺題時只用已作答的題目算（min 與 range 也跟著縮），等同 RAND「以已答題目平均」的處理，
    // 比直接套用整個構面的 min/range 合理——否則漏一題就會被當成該題拿最低分。
    const answered = details.filter((d) => d.oriented !== null);
    const sum = answered.reduce((s, d) => s + (d.oriented as number), 0);
    const min = answered.length;
    const max = answered.reduce((s, d) => s + d.levels, 0);
    const range = max - min;
    const score = answered.length > 0 && range > 0 ? ((sum - min) / range) * 100 : null;

    return {
      key: scale.key,
      label: scale.label,
      score: score !== null ? Math.round(score * 10) / 10 : null,
      answeredCount: answered.length,
      totalItems: scale.items.length,
      sum: answered.length > 0 ? sum : null,
      min: answered.length > 0 ? min : null,
      range: answered.length > 0 ? range : null,
      details,
    };
  });
  return { scales };
}

// ---------- PSQI ----------
// 計分依據：docs/生活品質量表及睡眠量表計分.docx（2026-08-20 使用者提供，此為本研究的最終計分方式），
// 演算法本體同 Buysse et al. 1989（7 面向各 0-3 分，總分 0-21 分）。
//
// 判定門檻：docx 明訂「PSQI 分數為 5 分或 5 分以上時，即顯示有睡眠品質障礙」＝ **>= 5**。
// 注意這比 Buysse 原文的 > 5 寬一格，5 分整在原文算正常、在本研究算睡眠品質障礙——依 docx 為準。
//
// docx 的面向定義與本問卷題號有落差（它把「主觀睡眠品質」寫成問題9、「藥物使用」寫成問題6、
// 「日間功能障礙」寫成問題7+8）。但它對每個面向的**文字描述**跟本問卷的 Q6/Q7/Q8/Q9 一一對得上
// （Q6=整體睡眠品質、Q7=助眠藥物、Q8=瞌睡、Q9=無心完成），且與 Buysse 原始定義一致，
// 因此判定為 docx 的題號誤植，實作採用文字描述對應的題目。
//
// 第10、11題（睡伴／室友狀況與睡伴觀察到的情形，order_no 20-25）不列入總分——docx 特別強調
// 「不要把問題10、問題11的分數再加進去，否則會造成 PSQI 總分錯誤，保留為原始／描述性資料即可」。
//
// order_no 對照（2026-08-20 起）：1-4 = Q1-Q4，5-13 = 5a-5i，14 = 5j 文字說明，15 = 5j 頻率，
// 16-19 = Q6-Q9，20 = Q10，21-25 = Q11a-11e。
// 2026-08-20 之前建的回覆沒有 order_no 15（當時 5j 只收文字），C5 會把它當 0 分處理——這正好是官方
// 對「沒有其他睡眠困擾」的計法，所以舊資料的分數不會因為這次補題而改變。

function parseLeadingNumber(text: unknown): number | null {
  if (typeof text === "number") return Number.isFinite(text) ? text : null;
  if (typeof text !== "string") return null;
  const m = text.match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export const PSQI_QUESTIONNAIRE_NAME = "匹茲堡睡眠品質量表（PSQI）";

/**
 * PSQI 的上床（Q1）／起床（Q3）時間題 order_no。這兩題是 text 型態，
 * 表單要用時間輸入元件保證送出 HH:MM——診間人員曾經手打出 `23::40`，
 * parseClockMinutes 認不得，睡眠效率面向與整筆總分就會變成 null。
 */
export const PSQI_CLOCK_ORDERS = [1, 3];

/**
 * 把 `23::40`（重複冒號）、`9:5`（未補零）這類手打髒格式正規化成 `HH:MM`。
 * 認不出來就原樣回傳，讓 parseClockMinutes 照常判定為無效，不要硬猜。
 */
export function normalizeClockInput(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2})\s*:+\s*(\d{1,2})$/);
  if (!m) return raw;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return raw;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
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
  /** 用到哪幾題（order_no）與其取到的值，給後台驗算頁面逐步核對用 */
  inputs: { label: string; value: string }[];
  /** 這個面向怎麼從 inputs 算到 score 的，寫成人看得懂的一句話 */
  formula: string;
}

/** docx：PSQI 分數為 5 分或 5 分以上即顯示有睡眠品質障礙（比 Buysse 原文的 >5 寬一格） */
export const PSQI_POOR_SLEEP_CUTOFF = 5;

export interface PSQIResult {
  components: PSQIComponentResult[];
  global: number | null; // 0-21，任一面向缺資料則為 null（不用 0 頂替，避免低估）
  poorSleep: boolean | null; // global >= PSQI_POOR_SLEEP_CUTOFF
  sleepEfficiencyPct: number | null;
}

export function computePSQI(answers: AnswerMap): PSQIResult {
  const num = (orderNo: number): number | null => {
    const v = answers[orderNo];
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // C1 主觀睡眠品質：Q6（order_no 16），已是 0-3
  const c1 = num(16);

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

  // C5 睡眠困擾：Q5b-5j 共9小題加總（order_no 6-13 為 5b-5i，15 為 5j 頻率）。
  // 5j 未作答視為 0——官方對「沒有其他睡眠困擾」就是計 0 分，也讓補題前的舊回覆維持原分數。
  const disturbanceOrders = [6, 7, 8, 9, 10, 11, 12, 13];
  const disturbanceValues = disturbanceOrders.map(num).filter((v): v is number => v !== null);
  const q5j = num(15) ?? 0;
  const c5 =
    disturbanceValues.length === disturbanceOrders.length
      ? bucket(disturbanceValues.reduce((s, v) => s + v, 0) + q5j, [0, 9, 18])
      : null;

  // C6 安眠藥物使用：Q7（order_no 17），已是 0-3
  const c6 = num(17);

  // C7 日間功能障礙：Q8 + Q9（order_no 18, 19）加總後分級
  const q8 = num(18);
  const q9 = num(19);
  const c7 = q8 === null || q9 === null ? null : bucket(q8 + q9, [0, 2, 4]);

  const show = (v: unknown) => (v === null || v === undefined || v === "" ? "（未作答）" : String(v));
  const disturbanceSum = disturbanceValues.reduce((s, v) => s + v, 0) + q5j;

  const components: PSQIComponentResult[] = [
    {
      key: "sleep_quality",
      label: "主觀睡眠品質",
      score: c1,
      inputs: [{ label: "Q6 整體睡眠品質（第16題）", value: show(answers[16]) }],
      formula: "直接採用 Q6 的 0-3 分",
    },
    {
      key: "sleep_latency",
      label: "睡眠潛伏期",
      score: c2,
      inputs: [
        { label: "Q2 入睡所需分鐘（第2題）", value: show(answers[2]) },
        { label: "Q5a 無法30分鐘內入睡（第5題）", value: show(answers[5]) },
      ],
      formula: `Q2 分鐘數換算（≤15→0、≤30→1、≤60→2、>60→3）＝ ${show(latencyRecode)}，加上 Q5a ${show(q5a)} ＝ ${show(
        latencyRecode !== null && q5a !== null ? latencyRecode + q5a : null
      )}，再分級（0→0、1-2→1、3-4→2、5-6→3）`,
    },
    {
      key: "sleep_duration",
      label: "睡眠時數",
      score: c3,
      inputs: [{ label: "Q4 實際睡眠時數（第4題）", value: show(answers[4]) }],
      formula: `時數 ${show(hoursSlept)} 小時 → ≥7→0、6-6.9→1、5-5.9→2、<5→3`,
    },
    {
      key: "sleep_efficiency",
      label: "睡眠效率",
      score: c4,
      inputs: [
        { label: "Q1 上床時間（第1題）", value: show(answers[1]) },
        { label: "Q3 起床時間（第3題）", value: show(answers[3]) },
        { label: "Q4 實際睡眠時數（第4題）", value: show(answers[4]) },
      ],
      formula: `睡眠效率 = 實際睡眠時數 ÷ 臥床時數 × 100% = ${
        sleepEfficiencyPct === null ? "（資料不足）" : `${sleepEfficiencyPct.toFixed(1)}%`
      } → ≥85%→0、75-84%→1、65-74%→2、<65%→3`,
    },
    {
      key: "sleep_disturbance",
      label: "睡眠困擾",
      score: c5,
      inputs: [
        ...disturbanceOrders.map((o, i) => ({
          label: `Q5${"bcdefghi"[i]}（第${o}題）`,
          value: show(answers[o]),
        })),
        { label: "Q5j 其他困擾頻率（第15題，未作答視為0）", value: show(answers[15]) },
      ],
      formula: `5b-5j 共9題加總 = ${show(
        disturbanceValues.length === disturbanceOrders.length ? disturbanceSum : null
      )} → 0→0、1-9→1、10-18→2、19-27→3`,
    },
    {
      key: "sleep_medication",
      label: "安眠藥物使用",
      score: c6,
      inputs: [{ label: "Q7 助眠藥物使用頻率（第17題）", value: show(answers[17]) }],
      formula: "直接採用 Q7 的 0-3 分",
    },
    {
      key: "daytime_dysfunction",
      label: "日間功能障礙",
      score: c7,
      inputs: [
        { label: "Q8 瞌睡無法保持清醒（第18題）", value: show(answers[18]) },
        { label: "Q9 無心完成該做的事（第19題）", value: show(answers[19]) },
      ],
      formula: `Q8 ${show(q8)} + Q9 ${show(q9)} = ${show(q8 !== null && q9 !== null ? q8 + q9 : null)} → 0→0、1-2→1、3-4→2、5-6→3`,
    },
  ];

  const hasAllComponents = components.every((c) => c.score !== null);
  const global = hasAllComponents ? components.reduce((s, c) => s + (c.score as number), 0) : null;
  const poorSleep = global === null ? null : global >= PSQI_POOR_SLEEP_CUTOFF;

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

