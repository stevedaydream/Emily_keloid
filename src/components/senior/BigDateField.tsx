"use client";

// 出生日期（2026-08-20）。原本用 YearWheel 只收年份，改成收精確日期：
// 往回捲 80 年的履帶要滑很久，而原生 date 欄位在平板上點下去就是系統日曆，
// 年份可以直接跳選，比履帶快，也是長輩在其他 App 上看過的介面。
//
// 刻意不自製日曆：系統日曆的字級、觸控區與無障礙都是 OS 調好的，自己畫只會更小。
// 欄位本身放大到跟大按鈕同一個高度（56px 以上）與字級，免得只有彈出的日曆是大的。

export default function BigDateField({
  value,
  onChange,
  min,
  max,
}: {
  /** ISO `YYYY-MM-DD`；空字串代表未填 */
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
}) {
  return (
    <div className="space-y-3">
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-16 w-full rounded-xl border-2 border-brand-200 bg-white px-4 text-2xl tabular-nums text-ink outline-none focus:border-brand-500"
      />
      {/* 民國年對照：長輩報生日多半講民國，選完給一行確認才不會選錯 60 年 */}
      <p className="text-center text-lg text-ink/50">{describe(value)}</p>
    </div>
  );
}

function describe(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "尚未選擇";
  const [, y, mo, d] = m;
  return `民國 ${Number(y) - 1911} 年 ${Number(mo)} 月 ${Number(d)} 日`;
}
