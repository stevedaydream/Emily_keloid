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
  unset = false,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  /**
   * 還沒選過（外層傳進來的原始值是空的，`value` 只是用來決定捲軸停在哪的起始位置）。
   *
   * 2026-08-24：這一格原本會把起始位置畫成「已選中」的樣子——身高停在 160 並高亮，
   * 病人以為答了、按下一步，實際上父層 state 還是空字串，資料存成 null。
   * 實測那筆測試資料的身高、體重、PSQI 第 1 題（上床時間）與第 3 題（起床時間）
   * 全都是這樣掉的，而 PSQI 少了那兩題就算不出睡眠效率，整份總分變成「資料不足」。
   *
   * 不改成「掛載時直接把起始值寫回去」是刻意的：那等於幫病人答了 160 公分。
   * 誠實的做法是畫面上講清楚還沒選，滑動或點一下才算數。
   */
  unset?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 這個履帶被「人」動過了嗎。下面的 effect 會用 scrollTo 把起始位置捲到中間，
  // 那也會觸發 onScroll——沒有這個旗標的話，還沒選過的履帶一掛載就會自己回報起始值，
  // 等於系統幫病人答了 160 公分，正是這次要修掉的行為。
  const interacted = useRef(false);

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
      // 還沒選過時，只要人動過就一律回報，即使停回起始那一格——滑出去又滑回 160
      // 也是「病人選了 160」，拿 item.value !== value 擋掉會讓那個動作靜悄悄地不算數。
      if (item && (unset ? interacted.current : item.value !== value)) onChange(item.value);
    }, 120);
  }

  return (
    // 還沒選過時多留 22px 給下方的提示。捲動視窗本身仍固定 ITEM_HEIGHT × VISIBLE，
    // 不能讓它跟著長高——snap 的對齊數學是拿 snapport 中心算的，容器一變高就整排偏半格。
    <div className="relative flex-1" style={{ height: ITEM_HEIGHT * VISIBLE + (unset ? 22 : 0) }}>
      {/* 中間那一格的框，讓「現在選的是這個」看得出來。
          還沒選過時改成虛線＋淡色，並在下方壓一行提示——實線框配著一個數字
          就是「已經選好了」的意思，而那時候還沒有任何值。 */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 z-10 rounded-lg border-2 ${
          unset ? "border-dashed border-brand-300" : "border-brand-500"
        }`}
        style={{ top: ITEM_HEIGHT, height: ITEM_HEIGHT }}
      />
      {unset && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-10 text-center text-sm text-brand-600"
          style={{ top: ITEM_HEIGHT * VISIBLE + 2 }}
        >
          ↑↓ 滑動或點一下選擇
        </div>
      )}
      {/* 對齊的數學：容器高 = ITEM_HEIGHT × VISIBLE，內容 = 上墊片 + 各項目 + 下墊片。
          snap-center 把項目中心對到 snapport 中心（= 容器中心 84），項目 k 的中心在
          內容座標 56 + k×56 + 28，所以 scrollTop = k×56——正好跟 effect 的 scrollTo
          與 handleScroll 的 round(scrollTop/56) 一致，也跟高亮框（top=56、高 56）重合。
          ⚠️ 不要加 scrollPaddingTop：那會把 snapport 上緣往下推，中心從 84 變 112，
          每一項就會停在高亮框偏半格（28px）的位置。 */}
      <div
        ref={ref}
        onScroll={handleScroll}
        // 「人動過了」的四種入口：手指、滑鼠滾輪、鍵盤、拖曳捲軸。
        onPointerDown={() => (interacted.current = true)}
        onTouchStart={() => (interacted.current = true)}
        onWheel={() => (interacted.current = true)}
        onKeyDown={() => (interacted.current = true)}
        role="listbox"
        aria-label={ariaLabel}
        tabIndex={0}
        className="snap-y snap-mandatory overflow-y-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ height: ITEM_HEIGHT * VISIBLE }}
      >
        {/* 上下各墊一格，第一個與最後一個項目才捲得到中間 */}
        <div style={{ height: ITEM_HEIGHT }} aria-hidden />
        {items.map((item) => (
          <div
            key={item.value}
            role="option"
            aria-selected={!unset && item.value === value}
            onClick={() => onChange(item.value)}
            className={`flex snap-center items-center justify-center text-xl tabular-nums ${
              !unset && item.value === value ? "font-semibold text-ink" : "text-ink/45"
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
  // 兩欄共用一個 unset：只滑了小時就送出 `23:00`（分鐘取起始值），對 PSQI 的
  // 就寢/起床時間夠用，也比整格不算數好——scoring 的 parseClockMinutes 要的就是 HH:MM。
  const unset = !/^\d{2}:\d{2}$/.test(value);

  return (
    <div className="flex gap-3">
      <Column items={hours} value={currentH} onChange={(h) => onChange(`${h}:${currentM}`)} ariaLabel="小時" unset={unset} />
      <Column items={minutes} value={currentM} onChange={(m) => onChange(`${currentH}:${m}`)} ariaLabel="分鐘" unset={unset} />
    </div>
  );
}

/** 睡眠時數，0.5 小時級距。輸出純數字字串，parseLeadingNumber 直接吃。 */
export function HoursWheel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const items = range(0, 24).map((half) => {
    const h = half / 2;
    return { value: String(h), label: `${h} 小時` };
  });
  const unset = !items.some((i) => i.value === value);
  const current = unset ? "6" : value;
  return (
    <div className="flex">
      <Column items={items} value={current} onChange={onChange} ariaLabel="睡眠時數" unset={unset} />
    </div>
  );
}

/** 年份（用於「蟹足腫初次發生」）。往回 80 年，最新的年份排在最上面。 */
export function YearWheel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const thisYear = new Date().getFullYear();
  const items = range(thisYear - 80, thisYear)
    .reverse()
    .map((y) => ({ value: String(y), label: `${y} 年（民國 ${y - 1911}）` }));
  const unset = !items.some((i) => i.value === value);
  const current = unset ? String(thisYear) : value;
  return (
    <div className="flex">
      <Column items={items} value={current} onChange={onChange} ariaLabel="年份" unset={unset} />
    </div>
  );
}

/**
 * 身高（cm）。範圍 120-210，1cm 一格——選項多到排不成大按鈕，照決策 2026-07-29 用履帶。
 * 預設停在 160，長輩多半只要往上下捲幾格。
 */
export function HeightWheel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const items = range(120, 210).map((h) => ({ value: String(h), label: `${h} 公分` }));
  const unset = !items.some((i) => i.value === value);
  const current = unset ? "160" : value;
  return (
    <div className="flex">
      <Column items={items} value={current} onChange={onChange} ariaLabel="身高" unset={unset} />
    </div>
  );
}

/** 體重（kg）。範圍 30-150，1kg 一格，預設停在 60。 */
export function WeightWheel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const items = range(30, 150).map((w) => ({ value: String(w), label: `${w} 公斤` }));
  const unset = !items.some((i) => i.value === value);
  const current = unset ? "60" : value;
  return (
    <div className="flex">
      <Column items={items} value={current} onChange={onChange} ariaLabel="體重" unset={unset} />
    </div>
  );
}
