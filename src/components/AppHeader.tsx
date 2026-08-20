"use client";

import { useState } from "react";
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

/** 精簡模式也留著的核心動線。收案與個案列表是上面那兩顆按鈕，所以這裡只剩今日門診。 */
const NAV_CORE = [{ href: "/clinic-today", label: "今日門診" }];

/** 精簡模式收進「更多」的其餘功能。 */
const NAV_MORE = [
  { href: "/batch-edit", label: "批次編輯" },
  { href: "/admin", label: "後台管理" },
  { href: "/export", label: "資料匯出" },
  { href: "/about", label: "導覽" },
];

// 姓名顯示開關：只有掛了本機對照表（linked）才有意義，沒掛的時候整顆隱藏。
function ShowNamesToggle({ className = "" }: { className?: string }) {
  const { linked, showNames, toggleShowNames, sessionOnly } = useLocalNames();
  if (!linked) return null;
  return (
    <button
      type="button"
      onClick={toggleShowNames}
      title={
        sessionOnly
          ? "工程模式：對照表只讀進記憶體，重新整理就會消失"
          : showNames
          ? "目前顯示病人姓名（點擊隱藏）"
          : "目前隱藏病人姓名（點擊顯示）"
      }
      className={`whitespace-nowrap rounded-md border px-2 py-1 text-xs ${
        showNames
          ? "border-brand-300 bg-brand-50 text-brand-800"
          : "border-brand-200 bg-white text-ink/40"
      } ${className}`}
    >
      {showNames ? "姓名：顯示中" : "姓名：已隱藏"}
      {/* 工程模式掛的對照表重整就沒，標一下免得以為壞掉 */}
      {sessionOnly && <span className="ml-1 text-sky-600">(暫)</span>}
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
  const quickLinks = QUICK_LINKS;
  // 精簡模式：核心留在列上，其餘收進「更多」。非精簡模式就是一張攤平的完整導覽列。
  const navLinks = navCompact ? NAV_CORE : [...NAV_CORE, ...NAV_MORE];
  const collapsed = navCompact ? NAV_MORE : [];
  const primary = quickLinks[quickLinks.length - 1];
  const secondary = quickLinks[0];

  return (
    <header className="relative bg-paper-raised">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-brand-600 via-brand-400 to-accent-400" />
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4 md:gap-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="開啟選單"
            className="-ml-1 rounded p-1.5 text-brand-700 hover:bg-brand-50 md:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M2.5 5h15M2.5 10h15M2.5 15h15" strokeLinecap="round" />
            </svg>
          </button>
          <Link href="/" className="flex items-center gap-2 whitespace-nowrap">
            <BrandMark size={28} />
            <span className="font-heading text-sm font-medium text-brand-900">蟹足腫研究平台</span>
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-ink/60 md:flex">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="whitespace-nowrap hover:text-brand-700">
                {l.label}
              </Link>
            ))}
            {collapsed.length > 0 && (
              /* 用原生 details 而不是自己管 open state：點外面會自動收起，不必加全域監聽 */
              <details className="relative">
                <summary className="cursor-pointer list-none whitespace-nowrap hover:text-brand-700 [&::-webkit-details-marker]:hidden">
                  更多 ▾
                </summary>
                <div className="absolute left-0 top-full z-40 mt-2 flex min-w-36 flex-col rounded-md border border-brand-100 bg-paper-raised py-1 shadow-lg">
                  {collapsed.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="whitespace-nowrap px-3 py-1.5 text-ink/70 hover:bg-brand-50 hover:text-brand-800"
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              </details>
            )}
          </nav>
        </div>
        <div className="hidden items-center gap-2 md:flex">
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
            className="whitespace-nowrap text-sm text-brand-700 underline decoration-brand-300 hover:text-brand-900"
          >
            切換
          </Link>
        </div>
      </div>

      {/* 手機版側邊選單 */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
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
