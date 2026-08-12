// 病灶尺寸自由文字 → 結構化的長/寬/高（cm）。
//
// 為什麼需要這支：舊資料的尺寸全部塞在一格自由文字裡，而且寫法極不統一。
// 以下都是資料庫裡真實出現過的值：
//   "1.2 x 1.0 x 1.0 cm"   "3.9 x 3.1 x 1.4 cm"   "8*3 cm"   "8.5*4.5cm"
//   "about 4 cm"   "4-5cm"   "2.5 cm in size over the right upper back"
//   "Keloid about 0.8cm, from anterior through posterior"
//   "Left shoulder keloid scar, 7cm\nsupramuscular dissection 2cm"
//   "small keloid at right upper ear helix around 0.5-1cm\none large kelid about 2cm in size at left ear lobe"
//
// 設計原則：**寧可標成需要人工確認，也不要猜錯**。助理是拿這個省手 key，不是拿它當最終真相；
// 任何無法確定的情況都回 confidence != "exact"，匯入預覽會把那些列標出來要求人工過目。

export type SizeConfidence =
  | "exact" // 明確的 AxBxC 或 AxB
  | "partial" // 只解出一個維度（例如「about 4 cm」）
  | "ambiguous" // 解得出來但可能不只一處病灶／有範圍值，需人工確認
  | "none"; // 完全解不出數字

export type ParsedSize = {
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  confidence: SizeConfidence;
  /** 為什麼是這個信心度；會顯示在匯入預覽的人工確認清單上 */
  note: string;
};

const EMPTY: ParsedSize = { length_cm: null, width_cm: null, height_cm: null, confidence: "none", note: "" };

/** 全形數字/符號轉半形，各種乘號統一成 x，去掉多餘空白。 */
function normalize(raw: string): string {
  return raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)) // 全形數字
    .replace(/[．。]/g, ".") // 全形句點
    .replace(/[×✕✖╳*﹡＊]/g, "x")
    .replace(/[Xˣ]/g, "x")
    .replace(/[~〜～]/g, "-")
    .replace(/[–—－]/g, "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const NUM = "\\d+(?:\\.\\d+)?";

/** 把帶單位的數值轉成 cm（mm → /10）。 */
function toCm(value: number, unit: string | undefined): number {
  return unit === "mm" ? Number((value / 10).toFixed(3)) : value;
}

/**
 * 一組「尺寸描述」：AxB、AxBxC，或帶單位的單一數值。
 * 刻意要求單一數值必須帶單位，否則 "9 keloidd at pubic are" 的 9（那是數量不是尺寸）會被誤認。
 */
const SIZE_GROUP = new RegExp(
  `${NUM}\\s*(?:mm|cm)?\\s*x\\s*${NUM}(?:\\s*(?:mm|cm)?\\s*x\\s*${NUM})?\\s*(?:mm|cm)?|${NUM}\\s*(?:mm|cm)`,
  "g"
);

/**
 * 文字裡出現幾組獨立的尺寸描述——用來偵測「一格塞了多處病灶」。
 *
 * 用「數幾組」而非「用分隔符切」，因為真實資料的分隔方式五花八門：
 * 換行、分號（`6.0X2.0X3.0;5.0X2.0X3.0`）、逗號（`5.6 x 2.1 x 1.5cm,6.6 x 2.9 x 1.1cm`）、
 * 甚至只有空格（`chest wall 3 and 5cm, R't cheek 5*5cm`）。
 */
function countSizeGroups(text: string): number {
  return [...text.matchAll(SIZE_GROUP)].length;
}

function looksLikeMultipleLesions(text: string): boolean {
  if (countSizeGroups(text) >= 2) return true;
  return /(another|one large|one small|second|另一|另有)/.test(text);
}

/**
 * 解析尺寸文字。
 * @param raw 原始儲存格內容
 */
export function parseSize(raw: string | null | undefined): ParsedSize {
  if (!raw || !String(raw).trim()) return EMPTY;
  const original = String(raw);
  const text = normalize(original);
  const multi = looksLikeMultipleLesions(text);

  // ① 三維：A x B x C（單位可有可無，可出現在中間或最後）
  const three = text.match(new RegExp(`(${NUM})\\s*(mm|cm)?\\s*x\\s*(${NUM})\\s*(mm|cm)?\\s*x\\s*(${NUM})\\s*(mm|cm)?`));
  if (three) {
    const unit = three[6] || three[4] || three[2] || "cm";
    return {
      length_cm: toCm(Number(three[1]), three[2] || unit),
      width_cm: toCm(Number(three[3]), three[4] || unit),
      height_cm: toCm(Number(three[5]), unit),
      confidence: multi ? "ambiguous" : "exact",
      note: multi ? "同一格疑似記錄了多處病灶，已取第一組尺寸" : "",
    };
  }

  // ② 二維：A x B
  const two = text.match(new RegExp(`(${NUM})\\s*(mm|cm)?\\s*x\\s*(${NUM})\\s*(mm|cm)?`));
  if (two) {
    const unit = two[4] || two[2] || "cm";
    return {
      length_cm: toCm(Number(two[1]), two[2] || unit),
      width_cm: toCm(Number(two[3]), unit),
      height_cm: null,
      confidence: multi ? "ambiguous" : "exact",
      note: multi ? "同一格疑似記錄了多處病灶，已取第一組尺寸" : "只有長寬兩個維度，高度未記錄",
    };
  }

  // ③ 範圍：A-B cm（例如 "4-5cm"、"0.5-1cm"）→ 取中間值並標為需確認
  const range = text.match(new RegExp(`(${NUM})\\s*-\\s*(${NUM})\\s*(mm|cm)`));
  if (range) {
    const unit = range[3];
    const mid = (Number(range[1]) + Number(range[2])) / 2;
    return {
      length_cm: toCm(Number(mid.toFixed(3)), unit),
      width_cm: null,
      height_cm: null,
      confidence: "ambiguous",
      note:
        `原文是範圍值 ${range[1]}-${range[2]}${unit}，已取中間值 ${toCm(mid, unit)}cm，請確認` +
        (multi ? "；且同一格疑似記錄了多處病灶" : ""),
    };
  }

  // ④ 單一數值＋單位
  const singles = [...text.matchAll(new RegExp(`(${NUM})\\s*(mm|cm)`, "g"))];
  if (singles.length === 1) {
    const [, v, unit] = singles[0];
    return {
      length_cm: toCm(Number(v), unit),
      width_cm: null,
      height_cm: null,
      confidence: multi ? "ambiguous" : "partial",
      note: multi
        ? "同一格疑似記錄了多處病灶，已取第一個數值"
        : "原文只有一個尺寸，已當作長度，寬與高未記錄",
    };
  }
  if (singles.length > 1) {
    const [, v, unit] = singles[0];
    return {
      length_cm: toCm(Number(v), unit),
      width_cm: null,
      height_cm: null,
      confidence: "ambiguous",
      note: `原文有 ${singles.length} 個尺寸數值（${singles.map((m) => m[1] + m[2]).join("、")}），已取第一個，請確認是否為多處病灶`,
    };
  }

  return { ...EMPTY, note: "找不到任何尺寸數值" };
}
