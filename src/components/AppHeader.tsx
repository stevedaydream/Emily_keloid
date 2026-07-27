"use client";

import { useState } from "react";
import Link from "next/link";

const QUICK_LINKS = [
  { href: "/cases", label: "個案列表" },
  { href: "/cases/new", label: "+ 新增個案" },
];

const NAV_LINKS = [
  { href: "/admin", label: "後台管理" },
  { href: "/export", label: "資料匯出" },
  { href: "/local-tools/mrn-mapping", label: "病歷號對照" },
];

export default function AppHeader({ operator }: { operator: string }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4 md:gap-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="開啟選單"
            className="-ml-1 rounded p-1.5 text-slate-600 hover:bg-slate-100 md:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M2.5 5h15M2.5 10h15M2.5 15h15" strokeLinecap="round" />
            </svg>
          </button>
          <Link href="/" className="whitespace-nowrap text-sm font-semibold">
            蟹足腫研究平台
          </Link>
          <nav className="hidden gap-4 text-sm text-slate-600 md:flex">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="whitespace-nowrap hover:text-slate-900">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/cases"
            className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            個案列表
          </Link>
          <Link
            href="/cases/new"
            className="whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            + 新增個案
          </Link>
          <span className="ml-2 whitespace-nowrap text-sm text-slate-500">
            目前操作者：<b className="text-slate-800">{operator}</b>
          </span>
          <Link
            href={`/operator?next=${encodeURIComponent("/")}`}
            className="whitespace-nowrap text-sm text-slate-400 underline hover:text-slate-700"
          >
            切換
          </Link>
        </div>
      </div>

      {/* 手機版側邊選單 */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-64 max-w-[80vw] flex-col bg-white p-4 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <span className="whitespace-nowrap text-sm font-semibold">蟹足腫研究平台</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="關閉選單"
                className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M3 3l12 12M15 3L3 15" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="mb-3 flex flex-col gap-2">
              {QUICK_LINKS.map((l, i) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={
                    i === 0
                      ? "whitespace-nowrap rounded-md border border-slate-300 px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
                      : "whitespace-nowrap rounded-md bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white hover:bg-slate-800"
                  }
                >
                  {l.label}
                </Link>
              ))}
            </div>

            <nav className="flex flex-col gap-1 border-t border-slate-200 pt-3 text-sm">
              {NAV_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="whitespace-nowrap rounded-md px-2 py-2 text-slate-700 hover:bg-slate-100"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto border-t border-slate-200 pt-3 text-xs text-slate-500">
              <p className="whitespace-nowrap">
                目前操作者：<b className="text-slate-800">{operator}</b>
              </p>
              <Link
                href={`/operator?next=${encodeURIComponent("/")}`}
                onClick={() => setOpen(false)}
                className="mt-1 inline-block whitespace-nowrap text-slate-400 underline"
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
