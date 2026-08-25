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

/** b − a 的天數（兩者皆為 ISO 日期）。 */
export function daysApart(a: string, b: string): number {
  const t1 = new Date(`${a}T00:00:00Z`).getTime();
  const t2 = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((t2 - t1) / 86400000);
}
