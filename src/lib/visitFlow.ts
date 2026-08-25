// 回診動線（決策 2026-08-20，2026-08-24 依助理回覆改版）。收案動線（lib/clinicFlow.ts）的姊妹檔。
//
// **為什麼回診需要一條動線**：一次回診在資料上「就是一筆 treatment_records」——
// 匯出的 Year 1 / Year 2 那些 FW1–FW24 格子，是 `visitsOf()` 拿 treatment_records
// 依日期分組推出來的。所以人員如果只是看了看、拍了張照就讓病人走，
// **那次回診在匯出檔裡等於沒發生**（該格填 0 ＝ 未回診），復發與症狀變化也一起消失
// （那兩欄掛在 treatment_records 上）。
// 有一個「追蹤（無治療）」的治療類型就是為了補這個洞，但它只是七個核取方塊之一，
// 標籤還寫著「沒有要登記就留空」——很容易整個被跳過。
//
// **跟收案動線的兩點不同**：
//  1. 回診**不硬擋**。收案只做一次，擋住還能請病人等一下；回診要做 24 次，
//     每個月都跳出一個擋路的關卡，最後一定會被繞過去。這裡只列出「還沒做的」。
//  2. 完成判定一律**限定當天**。三個月前拍過照不代表這次回診拍了——回診要的正是「現在長什麼樣」。
//
// **2026-08-24 助理回覆帶來的兩項改動**：
//  · VSS 整份停收，臨床評分只留 JSS（見 lib/clinicFlow.ts）。
//  · 病灶尺寸**只留術前 baseline**——手術把病灶切掉了，術後沒有東西可量。
//    所以術後回診不再要求重新量測（拍照照舊，追蹤的是疤痕外觀）。

import { addDays, addMonths, daysApart } from "@/lib/dates";

/**
 * 追蹤時間點要重測的量表（助理 2026-08-24）。三份一起測：
 * JSS 是醫師評分（主病灶的疤痕分類），SF-36／PSQI 是病人自評。
 * 原本 JSS「不重測」的規則同日推翻——只有重測才算得出術前 vs 術後的變化量。
 */
export const FOLLOWUP_SCALE_NAMES = [
  "JSS 疤痕診斷分類表",
  "SF-36 健康調查簡表",
  "匹茲堡睡眠品質量表（PSQI）",
] as const;

/** 追蹤時間點：手術日算起滿 1 / 6 / 12 個月（Baseline 那一次在收案動線收）。 */
export const FOLLOWUP_TIMEPOINT_MONTHS = [1, 6, 12] as const;

/**
 * 時間點的容許範圍：前後 10 天都算數（助理 2026-08-24「希望可以 key 的日期不要鎖死」）。
 * 病人不會剛好在術後第 30 天回診，日期鎖死的結果是那次資料被歸成「非時間點」而消失。
 */
export const TIMEPOINT_TOLERANCE_DAYS = 10;

export type FollowupTimepoint = {
  /** 術後第幾個月（1 / 6 / 12） */
  months: number;
  label: string;
  /** 標準日＝手術日 + N 個月 */
  anchor: string;
  windowStart: string;
  windowEnd: string;
};

/** 這個個案的三個追蹤時間點與各自的窗期。沒有手術日就沒有時間點可言。 */
export function followupTimepoints(surgeryDate: string | null): FollowupTimepoint[] {
  if (!surgeryDate) return [];
  return FOLLOWUP_TIMEPOINT_MONTHS.map((months) => {
    const anchor = addMonths(surgeryDate, months);
    return {
      months,
      label: `術後滿 ${months} 個月`,
      anchor,
      windowStart: addDays(anchor, -TIMEPOINT_TOLERANCE_DAYS),
      windowEnd: addDays(anchor, TIMEPOINT_TOLERANCE_DAYS),
    };
  });
}

/**
 * 這一次回診落在哪個追蹤時間點的窗期裡；都沒落到就回 null（＝一般回診，不用重測量表）。
 * 三個窗期（±10 天）互不重疊，所以最多命中一個。
 */
export function timepointForVisit(surgeryDate: string | null, visitDate: string): FollowupTimepoint | null {
  return followupTimepoints(surgeryDate).find((t) => visitDate >= t.windowStart && visitDate <= t.windowEnd) ?? null;
}

/** 術後第幾個月（手術當月＝0）。沒有手術日就回 null——術前的回診沒有月份可言。 */
export function monthsSinceSurgery(surgeryDate: string | null, visitDate: string): number | null {
  if (!surgeryDate) return null;
  const a = new Date(`${surgeryDate}T00:00:00Z`);
  const b = new Date(`${visitDate}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  // 還沒到「同一號」就不算滿一個月（術後 5/30 在 6/29 回診仍算第 0 個月）
  return b.getUTCDate() < a.getUTCDate() ? months - 1 : months;
}

/** 這一次回診該重測哪些量表。順序＝畫面上的排列順序；不在時間點上就一份都不用測。 */
export function scaleNamesForVisit(timepoint: FollowupTimepoint | null): string[] {
  return timepoint ? [...FOLLOWUP_SCALE_NAMES] : [];
}

/**
 * 把一個問卷填寫日歸到「Baseline / 術後 N 個月 / 窗期外」。匯出的問卷分數與逐題分頁用它分組，
 * 判定規則跟畫面上那條動線是同一套（同一個 `timepointForVisit`），兩邊不會各自解讀。
 */
export function timepointLabelFor(surgeryDate: string | null, date: string): string {
  if (!surgeryDate) return "Baseline（未手術）";
  if (date <= surgeryDate) return "Baseline（術前）";
  const tp = timepointForVisit(surgeryDate, date);
  return tp ? `術後 ${tp.months} 個月` : `窗期外（術後第 ${daysApart(surgeryDate, date)} 天）`;
}

export type VisitLesion = {
  id: string;
  site_no: number | null;
  body_site: string;
  is_primary: boolean;
  /** 目前這組尺寸的量測日；等於本次回診日才算「這次量過」 */
  measured_at: string | null;
  hasSize: boolean;
  /** 術前 baseline 的長寬高（術後回診時只拿來對照，不會被改寫） */
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  /** 本次回診當天拍的照片張數（不是歷來總數） */
  photoCountToday: number;
};

export function lesionLabel(l: VisitLesion): string {
  return `部位${l.site_no ?? "?"} ${l.body_site}`.trim();
}

export function measuredToday(l: VisitLesion, visitDate: string): boolean {
  return l.hasSize && l.measured_at === visitDate;
}

/**
 * 本次回診還沒做的事。空陣列＝這一關做完了。
 * 刻意不含「登記回診」與「量表」——那兩步各自有自己的判定，這裡只管病灶。
 *
 * `postOp`（已登記手術）時**不要求量測**：尺寸只收術前 baseline，病灶已經切掉了，
 * 硬要人量只會量到疤痕而把 baseline 蓋掉。術前回診仍要求量測——那時病灶還在，
 * 而且最後一次術前量測就是最終的 baseline。
 */
export function visitLesionTodos(lesions: VisitLesion[], visitDate: string, postOp: boolean): string[] {
  if (lesions.length === 0) return ["尚未登記任何病灶部位"];
  const out: string[] = [];
  for (const l of lesions) {
    if (!postOp && !measuredToday(l, visitDate)) out.push(`${lesionLabel(l)}：本次尚未重新量測`);
    if (l.photoCountToday === 0) out.push(`${lesionLabel(l)}：本次尚未拍照`);
  }
  return out;
}
