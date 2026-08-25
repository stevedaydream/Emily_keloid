// 以手術日為錨點的日期加減。抽血窗期（lib/biobank.ts）與追蹤時間點窗期（lib/visitFlow.ts）
// 都是「手術日 + N 個月 ± 幾天」，兩邊各寫一份月份加法遲早會在月底那幾天分歧
// （8/31 + 6 個月沒有 2/31），所以集中在這裡。

/** ISO 日期（YYYY-MM-DD）加天數。 */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO 日期加月數；目標月沒有那一天時夾到當月最後一天（8/31 + 6 → 2/28）。 */
export function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

/**
 * 出生日期換算今天的實歲（生日還沒到就減一歲）。`cases.age_at_enrollment` 仍是匯出與分析吃的欄位，
 * 所以任何寫 birth_date 的地方都要順手把它算出來。
 *
 * 2026-08-25 從 patient/[caseId]/intake/actions.ts 移到這裡共用：個案頁改出生日期時
 * 年齡原本不會跟著動，於是「改了生日、忘了改年齡」會讓匯出檔留著舊年齡。
 */
export function ageFromBirthDate(birthDate: string): number | null {
  const m = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age -= 1;
  return Number.isFinite(age) && age >= 0 && age <= 130 ? age : null;
}

/** b − a 的天數（兩者皆為 ISO 日期）。 */
export function daysApart(a: string, b: string): number {
  const t1 = new Date(`${a}T00:00:00Z`).getTime();
  const t2 = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((t2 - t1) / 86400000);
}
