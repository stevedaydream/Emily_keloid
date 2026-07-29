"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { TOUR_ROLES, TOUR_FACTS } from "@/lib/tour";

// 平台導覽：選身分 → 一步步走。每一步右邊是模擬畫面，當前落點高亮、其餘淡出。
// 用模擬畫面而不是截圖，是因為截圖會隨介面改版過期，而且沒辦法只高亮其中一塊。
export default function TourViewer() {
  const [roleIdx, setRoleIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const railRef = useRef<HTMLOListElement>(null);

  const role = TOUR_ROLES[roleIdx];
  const step = role.steps[stepIdx];
  const last = role.steps.length - 1;

  const go = useMemo(
    () => (delta: number) => setStepIdx((i) => Math.min(last, Math.max(0, i + delta))),
    [last]
  );

  // 手機上步驟軌道是橫向捲動的，翻頁後要讓當前那顆自己捲進視野
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth) return;
    const current = rail.querySelector<HTMLElement>('[data-state="current"]');
    current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [stepIdx, roleIdx]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && el.matches("input, textarea, select")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // 手機左右滑動翻頁：只認水平為主、距離夠長的滑動，才不會跟直向捲動打架
  const touch = useRef<{ x: number; y: number } | null>(null);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-xl font-medium text-brand-900">平台導覽</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/50">
          選一個身分，跟著走一遍你實際會做的事。每一步會標出畫面上的落點，以及那樣設計的原因。
        </p>
      </div>

      {/* 身分切換 */}
      <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="選擇身分">
        {TOUR_ROLES.map((r, i) => {
          const on = i === roleIdx;
          return (
            <button
              key={r.key}
              role="tab"
              aria-selected={on}
              onClick={() => {
                setRoleIdx(i);
                setStepIdx(0);
              }}
              className={`rounded-lg border border-t-[3px] bg-paper-raised p-3 text-left transition ${
                on ? "border-brand-200 border-t-accent-400 shadow-sm" : "border-brand-100 border-t-brand-100 hover:border-brand-200"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                {r.who}
                <span className="rounded-full border border-brand-100 bg-brand-50 px-1.5 py-0.5 font-data text-[11px] font-semibold text-brand-700">
                  {r.steps.length} 步
                </span>
              </span>
              <span className="mt-1 block text-xs text-ink/50">{r.what}</span>
            </button>
          );
        })}
      </div>

      <div className="grid overflow-hidden rounded-2xl border border-brand-100 bg-paper-raised md:grid-cols-[264px_1fr]">
        {/* 步驟軌道：沿用收案一條龍的圓點語彙（實心＝已過、金環＝現在、空心＝未到） */}
        {/* min-w-0 是必要的：手機上是單欄 grid，若不加，下面那個 overflow-x-auto 的
            步驟軌道不會自己捲動，而是把整欄撐到內容的自然寬度（實測 820px），
            旁邊的內容區跟著被撐開後再被 overflow-hidden 裁掉——畫面上就是「被切一半」。 */}
        <nav className="min-w-0 border-b border-brand-100 bg-paper-sunken py-3 md:border-b-0 md:border-r md:py-4" aria-label="步驟">
          <p className="px-4 pb-2 font-data text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/40">
            {role.rail}
          </p>
          <ol ref={railRef} className="flex min-w-0 gap-1.5 overflow-x-auto px-3 pb-1 md:block md:overflow-visible md:px-0">
            {role.steps.map((s, i) => {
              const state = i < stepIdx ? "done" : i === stepIdx ? "current" : "todo";
              return (
                <li key={s.t} data-state={state} className="relative shrink-0 md:shrink">
                  {/* 連線只在桌機的直向排列出現 */}
                  {i < last && (
                    <span className="absolute left-[27px] top-[26px] hidden h-[calc(100%-14px)] w-px bg-brand-100 md:block" />
                  )}
                  <span
                    className={`absolute z-10 rounded-full border-2 md:left-[22px] md:top-[17px] md:h-[11px] md:w-[11px] left-[10px] top-1/2 h-2 w-2 -translate-y-1/2 md:translate-y-0 ${
                      state === "done"
                        ? "border-brand-500 bg-brand-500"
                        : state === "current"
                          ? "border-accent-400 bg-accent-400 ring-4 ring-accent-400/25"
                          : "border-brand-200 bg-paper-sunken"
                    }`}
                  />
                  <button
                    onClick={() => setStepIdx(i)}
                    aria-current={state === "current" ? "step" : undefined}
                    className={`w-full whitespace-nowrap rounded-full border py-1.5 pl-6 pr-3 text-left text-xs md:whitespace-normal md:rounded-none md:border-0 md:py-2 md:pl-[46px] md:pr-4 md:text-sm ${
                      state === "current"
                        ? "border-accent-400 bg-accent-50 font-semibold text-brand-900 md:bg-paper-raised"
                        : state === "done"
                          ? "border-brand-100 bg-paper-raised text-ink/40 md:bg-transparent"
                          : "border-brand-100 bg-paper-raised text-ink/60 md:bg-transparent md:hover:bg-brand-50/60"
                    } max-w-[58vw] overflow-hidden text-ellipsis md:max-w-none`}
                  >
                    {s.t}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* 內容 */}
        <section
          className="flex min-w-0 flex-col p-4 md:p-6"
          onTouchStart={(e) => {
            if (e.touches.length !== 1) return void (touch.current = null);
            touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          }}
          onTouchEnd={(e) => {
            const t = touch.current;
            touch.current = null;
            if (!t) return;
            const dx = e.changedTouches[0].clientX - t.x;
            const dy = e.changedTouches[0].clientY - t.y;
            if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
            go(dx < 0 ? 1 : -1);
          }}
        >
          {/* 手機頂部翻頁：不必捲到模擬畫面下方才能按下一步 */}
          <div className="mb-3 flex items-center gap-2 border-b border-dashed border-brand-100 pb-3 md:hidden">
            <button
              onClick={() => go(-1)}
              disabled={stepIdx === 0}
              aria-label="上一步"
              className="h-9 w-9 shrink-0 rounded-lg border border-brand-300 text-brand-800 disabled:opacity-35"
            >
              ←
            </button>
            <button
              onClick={() => go(1)}
              disabled={stepIdx === last}
              aria-label="下一步"
              className="h-9 w-9 shrink-0 rounded-lg border border-brand-300 text-brand-800 disabled:opacity-35"
            >
              →
            </button>
            <span className="ml-auto font-data text-xs tabular-nums text-ink/40">
              步驟 {stepIdx + 1} / {role.steps.length}
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-data text-xs font-semibold tracking-wider text-accent-700">
              步驟 {stepIdx + 1} / {role.steps.length}
            </span>
            <h2 className="font-heading text-lg font-medium text-brand-900 md:text-xl">{step.t}</h2>
            <span className="rounded border border-brand-100 bg-brand-50 px-1.5 py-0.5 font-data text-[11px] text-brand-700">
              {step.where}
            </span>
          </div>

          <p
            className="mt-3 max-w-[64ch] text-sm text-ink/60 [&_strong]:font-semibold [&_strong]:text-ink"
            dangerouslySetInnerHTML={{ __html: step.body }}
          />

          {step.note && (
            <p
              className="mt-3 max-w-[68ch] rounded-lg border border-accent-300 bg-accent-50 p-3 text-sm text-accent-800 [&_b]:font-bold"
              dangerouslySetInnerHTML={{ __html: step.note }}
            />
          )}

          {/* 模擬畫面 */}
          <div className="mt-4 flex-1 overflow-hidden rounded-lg border border-brand-100 bg-paper-sunken">
            <div className="flex items-center gap-2 border-b border-brand-100 bg-paper-raised px-3 py-2 text-xs text-ink/40">
              <span className="h-2 w-2 rounded-full bg-brand-200" />
              <span className="rounded-full border border-brand-100 bg-paper-sunken px-2.5 py-0.5 font-data text-[11px] text-ink/60">
                {step.where}
              </span>
              <span className="ml-auto truncate">{step.role}</span>
            </div>
            <div className="flex flex-col gap-2 p-3">
              {step.blocks.map((b) => (
                <div
                  key={b.t}
                  className={`rounded-lg border p-2.5 transition ${
                    b.hl
                      ? "border-accent-400 bg-accent-50 shadow-[0_0_0_3px_rgba(227,169,48,0.22)]"
                      : "border-brand-100 bg-paper-raised opacity-50"
                  }`}
                >
                  <p className={`text-xs font-semibold ${b.hl ? "text-accent-800" : "text-ink/60"}`}>{b.t}</p>
                  {b.d && <p className={`mt-0.5 text-xs ${b.hl ? "text-accent-800/85" : "text-ink/40"}`}>{b.d}</p>}
                  {b.fields && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {b.fields.map((f) => (
                        <span
                          key={f}
                          className="rounded border border-dashed border-brand-200 bg-paper-sunken px-1.5 py-0.5 text-[11px] text-ink/50"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-brand-100 pt-3">
            <button
              onClick={() => go(-1)}
              disabled={stepIdx === 0}
              className="rounded-lg border border-brand-300 bg-paper-raised px-4 py-2 text-sm text-brand-800 transition hover:bg-brand-50 disabled:opacity-40"
            >
              ← 上一步
            </button>
            <button
              onClick={() => go(1)}
              disabled={stepIdx === last}
              className="rounded-lg border border-brand-700 bg-brand-700 px-4 py-2 text-sm text-white transition hover:bg-brand-800 disabled:opacity-40"
            >
              下一步 →
            </button>
            {step.href && (
              <Link
                href={step.href}
                className="rounded-lg border border-accent-300 bg-accent-50 px-4 py-2 text-sm text-accent-800 transition hover:bg-accent-100"
              >
                實際去做 ↗
              </Link>
            )}
            <span className="ml-auto hidden font-data text-xs tabular-nums text-ink/40 md:inline">
              {stepIdx + 1} / {role.steps.length}
            </span>
          </div>
        </section>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {TOUR_FACTS.map((f) => (
          <div
            key={f.title}
            className={`rounded-lg border border-brand-100 border-l-[3px] bg-paper-raised p-3 ${
              f.guard ? "border-l-accent-400" : "border-l-brand-500"
            }`}
          >
            <h3 className="text-sm font-bold text-brand-900">{f.title}</h3>
            <p className="mt-1 text-xs text-ink/60">{f.body}</p>
          </div>
        ))}
      </div>

      <p className="pt-2 text-xs text-ink/40">
        導覽內容對應平台現行功能。畫面為示意，實際版面以系統為準。
      </p>
    </div>
  );
}
