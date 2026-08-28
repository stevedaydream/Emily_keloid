"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import BrandMark from "@/components/ui/BrandMark";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { useLocalNames } from "@/components/LocalNameProvider";

// 導覽列只有一張（決策 2026-08-20，見 pending.md F-A5）。
// 原本依 landing_mode 分 intake/full 兩組，前提是「醫師只建檔、其他人只登打」；
// 部長退出收案後那個前提消失，收案的人同時也是登打的人，兩組都不合用。
//
// 取捨改由 nav_compact 決定：診間護理師只要收案建檔、門診當下登打、遞平板，
// 其餘「收折保留」——收進「更多」，不是拿掉。沒有權限，藏掉只會讓人從網址列繞回去。
const QUICK_LINKS = [
  { href: "/cases", label: "個案列表" },
  { href: "/intake", label: "+ 收案" },
];

/** 精簡模式也留著的核心動線。收案與個案列表是上面那兩顆按鈕，所以這裡只剩這兩條。
 *  「補拍照」放核心而不是收進「更多」（2026-08-28）：手機基本上只拿來拍照，
 *  拿起手機的人第一件事就是找「還有誰沒拍」——收進「更多」等於藏起來。
 *  這份清單同時餵桌機導覽列與手機側邊選單，所以加一次兩邊都有。 */
const NAV_CORE = [
  { href: "/clinic-today", label: "今日門診" },
  { href: "/photo-todo", label: "補拍照" },
];

/** 精簡模式收進「更多」的其餘功能。
 *  導覽（/about）刻意不在這裡——會迷路的人正是不會去翻「更多」的人，
 *  它改成常駐的「?」圖示（見 HelpLink），所有身分、所有螢幕寬度都看得到。 */
const NAV_MORE = [
  { href: "/batch-edit", label: "批次編輯" },
  { href: "/admin", label: "後台管理" },
  { href: "/export", label: "資料匯出" },
];

/** 平台導覽入口。永遠在導覽列上，不收進任何選單裡。 */
function HelpLink() {
  return (
    <Link
      href="/about"
      title="平台導覽：依身分分成三條動線，每一步標出畫面上的落點"
      aria-label="平台導覽"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-200 text-sm font-medium text-brand-700 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-900"
    >
      ?
    </Link>
  );
}

// 姓名顯示開關。2026-08-25 起姓名存在資料庫（不再是本機對照表），所以這顆一律顯示——
// 它現在的用途是投影／教學／診間有訪客時把姓名藏起來，跟有沒有掛對照表無關。
function ShowNamesToggle({ className = "" }: { className?: string }) {
  const { showNames, toggleShowNames } = useLocalNames();
  return (
    <button
      type="button"
      onClick={toggleShowNames}
      title={showNames ? "目前顯示病人姓名（點擊隱藏）" : "目前隱藏病人姓名（點擊顯示）"}
      className={`whitespace-nowrap rounded-md border px-2 py-1 text-xs ${
        showNames
          ? "border-brand-300 bg-brand-50 text-brand-800"
          : "border-brand-200 bg-white text-ink/40"
      } ${className}`}
    >
      {showNames ? "姓名：顯示中" : "姓名：已隱藏"}
    </button>
  );
}

export default function AppHeader({
  operator,
  navCompact = false,
}: {
  operator: string;
  navCompact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // 「更多」下拉。原本用原生 <details>，但它只有點 summary 才切換：
  // 點裡面的連結導航後 header 不會重新掛載，選單就一直開著；點外面也不會收。
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  // 選單被移出中段（見下方說明），外點關閉要同時排除按鈕與選單兩塊
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const quickLinks = QUICK_LINKS;
  // 精簡模式：核心留在列上，其餘收進「更多」。非精簡模式就是一張攤平的完整導覽列。
  const navLinks = navCompact ? NAV_CORE : [...NAV_CORE, ...NAV_MORE];
  const collapsed = navCompact ? NAV_MORE : [];
  const primary = quickLinks[quickLinks.length - 1];
  const secondary = quickLinks[0];

  useEffect(() => {
    if (!moreOpen) return;
    // pointerdown 而不是 click：click 要等到放開才觸發，捲動或拖曳時選單會賴著不走
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!moreRef.current?.contains(t) && !moreMenuRef.current?.contains(t)) setMoreOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  return (
    <header className="relative bg-paper-raised">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-brand-600 via-brand-400 to-accent-400" />
      {/* 版面分三段：品牌固定在左、導覽「?」固定在右，中間那段左右可捲（2026-08-20）。
          原本中段是 `hidden md:flex`，於是出現一段死區——平板豎著拿大約 600-950px，
          既低於「攤平的完整導覽列放得下」的寬度（實測約 950px 才夠），
          又高於 md（768px）而讓漢堡鈕消失，結果「?」右邊的所有東西被推出畫面外、
          又沒有側邊選單可以叫回來。改成可捲之後就沒有放不下的寬度了。 */}
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="開啟選單"
          className="-ml-1 shrink-0 rounded p-1.5 text-brand-700 hover:bg-brand-50 min-[480px]:hidden"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M2.5 5h15M2.5 10h15M2.5 15h15" strokeLinecap="round" />
          </svg>
        </button>
        <Link href="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          <BrandMark size={28} />
          <span className="font-heading text-sm font-medium text-brand-900">蟹足腫研究平台</span>
        </Link>

        {/* 中段：放不下就左右捲。480px 以下捲動視窗會窄到不能用，那邊交給側邊選單。
            斷點取 480 而不是 560：Xiaomi Pad SE 8.7 豎屏是 800 實體像素，
            CSS 寬度取決於系統密度——533（density 240）或 600（density 213）都有可能，
            把斷點壓在兩者之下，就不必賭那台裝置回報哪一個。 */}
        <div className="relative hidden min-w-0 flex-1 min-[480px]:block">
          <div className="flex items-center gap-4 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <nav className="flex items-center gap-4 text-sm text-ink/60">
              {navLinks.map((l) => (
                <Link key={l.href} href={l.href} className="whitespace-nowrap hover:text-brand-700">
                  {l.label}
                </Link>
              ))}
              {collapsed.length > 0 && (
                <div ref={moreRef} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setMoreOpen((v) => !v)}
                    aria-expanded={moreOpen}
                    aria-haspopup="menu"
                    className="whitespace-nowrap hover:text-brand-700"
                  >
                    更多 {moreOpen ? "▴" : "▾"}
                  </button>
                </div>
              )}
            </nav>

            {/* ml-auto：放得下時把操作區推到最右（維持原本的兩端對齊外觀）；
                放不下時 auto margin 自動歸零，變成接在導覽連結後面一起捲。 */}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <ShowNamesToggle />
              <Link href={secondary.href} className={buttonClasses("outline", "sm")}>
                {secondary.label}
              </Link>
              <Link href={primary.href} className={buttonClasses("primary", "sm")}>
                {primary.label}
              </Link>
              <span className="ml-2 whitespace-nowrap text-sm text-ink/50">
                目前操作者：<b className="text-ink/80">{operator}</b>
              </span>
              <Link
                href={`/operator?next=${encodeURIComponent("/")}`}
                className="whitespace-nowrap pr-6 text-sm text-brand-700 underline decoration-brand-300 hover:text-brand-900"
              >
                切換
              </Link>
            </div>
          </div>
          {/* 右緣淡出：橫向捲動最大的問題是看不出來「右邊還有東西」。
              捲到底時它蓋住的是最後一顆按鈕右邊的留白（上面那個 pr-6），不會擋到字。 */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-paper-raised to-transparent"
          />
        </div>

        <HelpLink />
      </div>

      {/* 「更多」的選單掛在 header 這一層，不放進中段——中段是 overflow-x-auto，
          依規範另一軸會跟著變成 auto，絕對定位的選單會被裁掉只露出一條。 */}
      {moreOpen && collapsed.length > 0 && (
        <div
          ref={moreMenuRef}
          role="menu"
          className="absolute left-4 top-full z-40 mt-1 flex min-w-36 flex-col rounded-md border border-brand-100 bg-paper-raised py-1 shadow-lg"
        >
          {collapsed.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              role="menuitem"
              onClick={() => setMoreOpen(false)}
              className="whitespace-nowrap px-3 py-1.5 text-ink/70 hover:bg-brand-50 hover:text-brand-800"
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}

      {/* 手機版側邊選單 */}
      {open && (
        <div className="fixed inset-0 z-50 min-[480px]:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-64 max-w-[80vw] flex-col bg-paper-raised p-4 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2 whitespace-nowrap font-heading text-sm font-medium text-brand-900">
                <BrandMark size={24} />
                蟹足腫研究平台
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="關閉選單"
                className="rounded p-1.5 text-ink/50 hover:bg-brand-50"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M3 3l12 12M15 3L3 15" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="mb-3 flex flex-col gap-2">
              {quickLinks.map((l, i) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={buttonClasses(i === 0 ? "outline" : "primary", "md", "center", "text-center")}
                >
                  {l.label}
                </Link>
              ))}
            </div>

            <nav className="flex flex-col gap-1 border-t border-brand-100 pt-3 text-sm">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="whitespace-nowrap rounded-md px-2 py-2 text-ink/70 hover:bg-brand-50"
                >
                  {l.label}
                </Link>
              ))}
              {collapsed.length > 0 && (
                <details className="mt-1 border-t border-brand-50 pt-1">
                  <summary className="cursor-pointer list-none rounded-md px-2 py-2 text-ink/50 [&::-webkit-details-marker]:hidden">
                    更多 ▾
                  </summary>
                  <div className="flex flex-col gap-1">
                    {collapsed.map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        onClick={() => setOpen(false)}
                        className="whitespace-nowrap rounded-md px-2 py-2 text-ink/70 hover:bg-brand-50"
                      >
                        {l.label}
                      </Link>
                    ))}
                  </div>
                </details>
              )}
            </nav>
            <div className="mt-3 border-t border-brand-100 pt-3">
              <ShowNamesToggle className="w-full" />
            </div>
            <div className="mt-auto border-t border-brand-100 pt-3 text-xs text-ink/50">
              <p className="whitespace-nowrap">
                目前操作者：<b className="text-ink/80">{operator}</b>
              </p>
              <Link
                href={`/operator?next=${encodeURIComponent("/")}`}
                onClick={() => setOpen(false)}
                className="mt-1 inline-block whitespace-nowrap text-brand-700 underline"
              >
                切換操作者
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
