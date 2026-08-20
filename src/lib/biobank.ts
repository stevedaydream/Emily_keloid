// 檢體清單與抽血時程（決策 2026-08-20，見 pending.md F-E）。
//
// 計畫書：實驗組每人採靜脈血 10 mL × 4 次（共 40 mL）
//   ① 手術前 baseline ② 術後第 3–7 天 ③ 術後第 28–35 天 ④ 治療完成後 6 個月 ±14 天
// 組織檢體於手術切除時取得（病灶內、病灶周邊），供免疫組織化學染色使用。
//
// 第 ④ 次的錨點用「手術日」而非「治療完成日」：放療方案最長 1800×3 次＝3 天，
// 與手術日的差距遠小於該次本身的 ±14 天窗期，誤差被窗期吸收，
// 不必多一個半年前要填對、半年後才會發現沒填的「治療完成日」欄位。

export type BiobankGroup = "組織" | "血液";

export const BIOBANK_ITEMS = [
  { key: "tissue_paraffin_block", label: "蠟塊", group: "組織" },
  { key: "tissue_keloid_fibroblast_culture", label: "Keloid fibroblast 原代培養（病灶內）", group: "組織" },
  { key: "tissue_periskin_fibroblast_culture", label: "Periskin fibroblast 原代培養（病灶周邊）", group: "組織" },
  { key: "blood_pre_op", label: "第 1 次：手術前 baseline", group: "血液" },
  { key: "blood_post_op_d3_7", label: "第 2 次：術後第 3–7 天", group: "血液" },
  { key: "blood_post_op_d28_35", label: "第 3 次：術後第 28–35 天", group: "血液" },
  { key: "blood_month6", label: "第 4 次：術後 6 個月（±14 天）", group: "血液" },
] as const;

export type BiobankItemKey = (typeof BIOBANK_ITEMS)[number]["key"];

export const BIOBANK_ITEM_LABEL: Record<string, string> = Object.fromEntries(
  BIOBANK_ITEMS.map((i) => [i.key, i.label])
);

/** 術前 baseline 沒有窗期——手術前完成即可，所以不在這張表裡（它在收案時就開待辦）。 */
type DrawWindowSpec =
  | { key: BiobankItemKey; label: string; kind: "days"; startDay: number; endDay: number }
  | { key: BiobankItemKey; label: string; kind: "months"; months: number; toleranceDays: number };

export const POST_OP_BLOOD_DRAWS: DrawWindowSpec[] = [
  { key: "blood_post_op_d3_7", label: "第 2 次抽血（術後 3–7 天）", kind: "days", startDay: 3, endDay: 7 },
  { key: "blood_post_op_d28_35", label: "第 3 次抽血（術後 28–35 天）", kind: "days", startDay: 28, endDay: 35 },
  { key: "blood_month6", label: "第 4 次抽血（術後 6 個月 ±14 天）", kind: "months", months: 6, toleranceDays: 14 },
];

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const addMonths = (iso: string, months: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // 例：8/31 + 6 個月沒有 2/31，夾到當月最後一天
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
};

export interface DrawWindow {
  key: BiobankItemKey;
  label: string;
  /** 排定日（提醒用）＝窗期起日 */
  dueDate: string;
  windowStart: string;
  windowEnd: string;
}

/** 依手術日算出後三次抽血的窗期。窗期存起訖兩個日期——3–7 與 28–35 都不對稱，中心點表達不了。 */
export function bloodDrawWindows(surgeryDate: string): DrawWindow[] {
  return POST_OP_BLOOD_DRAWS.map((spec) => {
    const [windowStart, windowEnd] =
      spec.kind === "days"
        ? [addDays(surgeryDate, spec.startDay), addDays(surgeryDate, spec.endDay)]
        : [
            addDays(addMonths(surgeryDate, spec.months), -spec.toleranceDays),
            addDays(addMonths(surgeryDate, spec.months), spec.toleranceDays),
          ];
    return { key: spec.key, label: spec.label, dueDate: windowStart, windowStart, windowEnd };
  });
}

/** 窗外採檢照實記錄、不擋，只標記為 protocol deviation。 */
export function isOutOfWindow(
  collectedDate: string | null | undefined,
  windowStart: string | null | undefined,
  windowEnd: string | null | undefined
): boolean {
  if (!collectedDate || !windowStart || !windowEnd) return false;
  return collectedDate < windowStart || collectedDate > windowEnd;
}

/** 術後追蹤：每月一次，共 24 個月（＝匯出的 FW1–FW24）。 */
export const FOLLOWUP_MONTHS = 24;

export function followupSchedule(surgeryDate: string): { month: number; label: string; dueDate: string }[] {
  return Array.from({ length: FOLLOWUP_MONTHS }, (_, i) => ({
    month: i + 1,
    label: `術後第 ${i + 1} 個月追蹤`,
    dueDate: addMonths(surgeryDate, i + 1),
  }));
}
