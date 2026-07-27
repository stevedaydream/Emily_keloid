"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type NavItem = { id: string; label: string };

export default function BackToTopButton() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<NavItem[]>([]);
  const supportsHover = useRef(false);

  useEffect(() => {
    supportsHover.current = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }, []);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    // 換頁後內容重新渲染，稍等一下再掃描頁面上可跳轉的區塊
    const t = setTimeout(() => {
      const els = Array.from(document.querySelectorAll<HTMLElement>("[data-nav-section]"));
      setSections(
        els
          .filter((el) => el.id)
          .map((el) => ({ id: el.id, label: el.dataset.navLabel || el.id }))
      );
    }, 150);
    return () => clearTimeout(t);
  }, [pathname]);

  function jumpTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setOpen(false);
  }

  function handleMainButtonClick() {
    if (open) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      setOpen(false);
    } else {
      setOpen(true);
    }
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-40"
      onMouseEnter={() => supportsHover.current && setOpen(true)}
      onMouseLeave={() => supportsHover.current && setOpen(false)}
    >
      {open && sections.length > 0 && (
        <div className="absolute bottom-14 right-0 max-h-80 w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <p className="px-2 py-1 text-xs font-semibold text-slate-400">跳到區塊（再點按鈕回到最上方）</p>
          <ul className="space-y-0.5">
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => jumpTo(s.id)}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        onClick={handleMainButtonClick}
        aria-label={open ? "回到最上方" : "開啟頁面導覽"}
        className={`flex h-11 w-11 flex-col items-center justify-center rounded-full text-white shadow-lg transition-colors ${
          open ? "bg-emerald-600 hover:bg-emerald-500" : "bg-slate-900 hover:bg-slate-800"
        }`}
      >
        {open ? (
          <span className="text-[10px] font-bold leading-none">TOP</span>
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 11l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </div>
  );
}
