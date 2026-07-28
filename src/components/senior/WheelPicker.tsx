"use client";

import { useEffect, useRef } from "react";

// 履帶捲動選擇器（決策 2026-07-29）：只用在選項太多、排不出大按鈕的地方——
// 上床／起床時間（24×12 種）、出生年份、睡眠時數。其餘一律用 BigChoice 的大按鈕。
//
// 實作用原生捲動 + scroll-snap，不自己算拖曳位移：原生捲動有慣性與無障礙支援，
// 且手指離開後 snap 會自動對齊到最近的項目。每個項目 56px，跟大按鈕同一個觸控尺寸。

const ITEM_HEIGHT = 56;
const VISIBLE = 3; // 上下各留一個當「還有更多」的提示

function Column({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const index = Math.max(0, items.findIndex((i) => i.value === value));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 初始／外部改值時把選中的項目捲到中間。behavior 用 auto，開頁不要有動畫。
    el.scrollTo({ top: index * ITEM_HEIGHT, behavior: "auto" });
  }, [index]);

  // 捲到定位（停止捲動 120ms）才回報，避免中途經過的每一格都觸發一次 onChange。
  // handleScroll 每次 render 重新建立，所以 timer 裡取到的 onChange/value 都是當下這一輪的。
  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const i = Math.round(el.scrollTop / ITEM_HEIGHT);
      const item = items[Math.min(items.length - 1, Math.max(0, i))];
      if (item && item.value !== value) onChange(item.value);
    }, 120);
  }

  return (
    <div className="relative flex-1" style={{ height: ITEM_HEIGHT * VISIBLE }}>
      {/* 中間那一格的框，讓「現在選的是這個」看得出來 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 z-10 rounded-lg border-2 border-brand-500"
        style={{ top: ITEM_HEIGHT, height: ITEM_HEIGHT }}
      />
      <div
        ref={ref}
        onScroll={handleScroll}
        role="listbox"
        aria-label={ariaLabel}
        tabIndex={0}
        className="h-full snap-y snap-mandatory overflow-y-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollPaddingTop: ITEM_HEIGHT }}
      >
        {/* 上下各墊一格，第一個與最後一個項目才捲得到中間 */}
        <div style={{ height: ITEM_HEIGHT }} aria-hidden />
        {items.map((item) => (
          <div
            key={item.value}
            role="option"
            aria-selected={item.value === value}
            onClick={() => onChange(item.value)}
            className={`flex snap-center items-center justify-center text-xl tabular-nums ${
              item.value === value ? "font-semibold text-ink" : "text-ink/45"
            }`}
            style={{ height: ITEM_HEIGHT }}
          >
            {item.label}
          </div>
        ))}
        <div style={{ height: ITEM_HEIGHT }} aria-hidden />
      </div>
    </div>
  );
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const range = (from: number, to: number, step = 1) => {
  const out: number[] = [];
  for (let i = from; i <= to; i += step) out.push(i);
  return out;
};

/**
 * 時間選擇（HH:MM）。分鐘以 5 為級距——PSQI 只要粗略的就寢/起床時間，
 * 給 60 格只是讓長輩多捲。輸出格式固定 `HH:MM`，`scoring.ts` 的 parseClockMinutes 直接吃。
 */
export function TimeWheel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [hh = "", mm = ""] = value.split(":");
  const hours = range(0, 23).map((h) => ({ value: pad2(h), label: `${pad2(h)} 點` }));
  const minutes = range(0, 55, 5).map((m) => ({ value: pad2(m), label: `${pad2(m)} 分` }));
  const currentH = hours.some((h) => h.value === hh) ? hh : "22";
  const currentM = minutes.some((m) => m.value === mm) ? mm : "00";

  return (
    <div className="flex gap-3">
      <Column items={hours} value={currentH} onChange={(h) => onChange(`${h}:${currentM}`)} ariaLabel="小時" />
      <Column items={minutes} value={currentM} onChange={(m) => onChange(`${currentH}:${m}`)} ariaLabel="分鐘" />
    </div>
  );
}

/** 睡眠時數，0.5 小時級距。輸出純數字字串，parseLeadingNumber 直接吃。 */
export function HoursWheel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const items = range(0, 24).map((half) => {
    const h = half / 2;
    return { value: String(h), label: `${h} 小時` };
  });
  const current = items.some((i) => i.value === value) ? value : "6";
  return (
    <div className="flex">
      <Column items={items} value={current} onChange={onChange} ariaLabel="睡眠時數" />
    </div>
  );
}

/** 年份（用於「蟹足腫初次發生」）。往回 80 年，最新的年份排在最上面。 */
export function YearWheel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const thisYear = new Date().getFullYear();
  const items = range(thisYear - 80, thisYear)
    .reverse()
    .map((y) => ({ value: String(y), label: `${y} 年（民國 ${y - 1911}）` }));
  const current = items.some((i) => i.value === value) ? value : String(thisYear);
  return (
    <div className="flex">
      <Column items={items} value={current} onChange={onChange} ariaLabel="年份" />
    </div>
  );
}
