// 回診動線（決策 2026-08-20）。收案動線（lib/clinicFlow.ts）的姊妹檔。
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
//  2. 完成判定一律**限定當天**。病灶三個月前拍過照、量過尺寸，不代表這次回診做了——
//     回診要的正是「現在長什麼樣」。

/** 每次回診都重測：VSS 是追蹤治療成效的量表，隔次才測就算不出 Delta。 */
export const PER_VISIT_SCALE_NAMES = ["Vancouver Scar Scale (VSS)"] as const;

/**
 * 只在年度時間點重測的量表。生活品質這種尺度一兩個月不會動，每次都問只會讓病人厭煩，
 * 答案也不會更準。術後 12 / 24 個月各一次，正好對上 pending.md E2 想要的
 * 「術前 vs 術後一年」比較。
 */
export const ANNUAL_SCALE_NAMES = ["SF-36 健康調查簡表", "匹茲堡睡眠品質量表（PSQI）"] as const;
export const ANNUAL_SCALE_MONTHS = [12, 24];

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

/** 這一次回診該重測哪些量表。順序＝畫面上的排列順序。 */
export function scaleNamesForVisit(monthIndex: number | null): string[] {
  const annual = monthIndex !== null && ANNUAL_SCALE_MONTHS.includes(monthIndex);
  return [...PER_VISIT_SCALE_NAMES, ...(annual ? ANNUAL_SCALE_NAMES : [])];
}

export type VisitLesion = {
  id: string;
  site_no: number | null;
  body_site: string;
  /** 目前這組尺寸的量測日；等於本次回診日才算「這次量過」 */
  measured_at: string | null;
  hasSize: boolean;
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
 */
export function visitLesionTodos(lesions: VisitLesion[], visitDate: string): string[] {
  if (lesions.length === 0) return ["尚未登記任何病灶部位"];
  const out: string[] = [];
  for (const l of lesions) {
    if (!measuredToday(l, visitDate)) out.push(`${lesionLabel(l)}：本次尚未重新量測`);
    if (l.photoCountToday === 0) out.push(`${lesionLabel(l)}：本次尚未拍照`);
  }
  return out;
}
