"use client";

import { useState } from "react";
import Link from "next/link";
import LesionMeasureFlow from "../clinic-flow/LesionMeasureFlow";
import RegisterVisitForm, { CompleteScheduleItem } from "./RegisterVisitForm";
import { measuredToday, visitLesionTodos, lesionLabel, type VisitLesion } from "@/lib/visitFlow";
import type { ClinicianScale, LesionCheck } from "@/lib/clinicFlow";
import type { BodyView } from "@/lib/bodyZones";

// 回診動線（決策 2026-08-20）。跟收案動線同一個長相：四步一頁、一次展開一步、
// 做完的收成綠字。差別見 lib/visitFlow.ts 的說明——這裡**不硬擋**，
// 而且每一步的「完成」都限定在本次回診當天。

type Zone = { id: string; zone_key: string; view: BodyView; display_name: string; dose_category: string };
type Option = { id: string; label: string };
type DueItem = { id: string; label: string; due_date: string; actions: string[] | null };

export default function VisitFlow({
  caseId,
  researchId,
  today,
  surgeryDate,
  monthIndex,
  visitRegistered,
  lesions,
  zones,
  sex,
  scales,
  missingScaleNames,
  symptomOptions,
  treatmentTypes,
  dueItems,
}: {
  caseId: string;
  researchId: string;
  today: string;
  surgeryDate: string | null;
  monthIndex: number | null;
  visitRegistered: boolean;
  lesions: VisitLesion[];
  zones: Zone[];
  sex: string | null;
  scales: ClinicianScale[];
  missingScaleNames: readonly string[];
  symptomOptions: Option[];
  treatmentTypes: { id: string; name: string }[];
  dueItems: DueItem[];
}) {
  const todos = visitLesionTodos(lesions, today);
  const lesionsDone = todos.length === 0;
  const scalesDone = scales.length > 0 && scales.every((s) => s.done);
  const wrapUpDone = dueItems.length === 0;
  const allDone = visitRegistered && lesionsDone && scalesDone && wrapUpDone;

  const steps = [
    { n: 1, title: "登記本次回診", done: visitRegistered, hint: visitRegistered ? `${today} 已登記` : "沒登記＝匯出檔視同沒回診" },
    {
      n: 2,
      title: "重新量測與拍照",
      done: lesionsDone,
      hint: `${lesions.filter((l) => measuredToday(l, today)).length}/${lesions.length} 個部位本次已量測`,
    },
    {
      n: 3,
      title: "醫師評分",
      done: scalesDone,
      hint: scales.map((s) => s.name.replace("（PSQI）", "").replace(" 健康調查簡表", "").replace("Vancouver Scar Scale ", "")).join(" ＋ "),
    },
    { n: 4, title: "收尾", done: wrapUpDone, hint: wrapUpDone ? "沒有待辦時程" : `${dueItems.length} 項待辦時程未處理` },
  ];
  const firstOpen = steps.find((s) => !s.done)?.n ?? 4;
  const [open, setOpen] = useState<number>(firstOpen);

  // LesionMeasureFlow 是收案動線的元件，吃的是 LesionCheck。回診沒有免除註記
  // （免除是收案當次的決定，三個月後不該還替這次回診放行），所以兩個 waived 一律傳 false。
  const asLesionCheck: LesionCheck[] = lesions.map((l) => ({
    id: l.id,
    site_no: l.site_no,
    body_site: l.body_site,
    length_cm: null,
    width_cm: null,
    height_cm: null,
    measure_waived: false,
    photo_waived: false,
    photoCount: l.photoCountToday,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      <div>
        <h1 className="text-2xl font-semibold text-ink">回診登記</h1>
        <p className="mt-1 font-data text-sm text-ink/50">
          {researchId} ・ {today}
          {monthIndex !== null ? ` ・ 術後第 ${monthIndex} 個月` : surgeryDate ? "" : " ・ 尚未登記手術"}
        </p>
      </div>

      {allDone && (
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-5 text-center">
          <p className="text-5xl">✓</p>
          <h2 className="mt-2 text-2xl font-semibold text-emerald-900">本次回診完成</h2>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/cases/${caseId}`}
              className="flex min-h-14 flex-1 items-center justify-center rounded-xl bg-brand-700 px-4 text-lg font-medium text-white"
            >
              看這位的個案頁
            </Link>
            <Link
              href="/clinic-today"
              className="flex min-h-14 flex-1 items-center justify-center rounded-xl border-2 border-brand-200 px-4 text-lg text-ink/80"
            >
              回今日門診
            </Link>
          </div>
        </div>
      )}

      <ol className="space-y-3">
        {steps.map((s) => {
          const expanded = open === s.n;
          return (
            <li
              key={s.n}
              className={`rounded-xl border-2 ${s.done ? "border-emerald-200 bg-emerald-50/40" : "border-brand-200 bg-white"}`}
            >
              <button
                type="button"
                onClick={() => setOpen(expanded ? -1 : s.n)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-medium ${
                    s.done ? "bg-emerald-500 text-white" : "border-2 border-brand-300 text-ink/50"
                  }`}
                >
                  {s.done ? "✓" : s.n}
                </span>
                <span className="flex-1">
                  <span className="block text-lg font-medium text-ink">{s.title}</span>
                  <span className="block text-sm text-ink/50">{s.hint}</span>
                </span>
                <span className="text-ink/30">{expanded ? "▲" : "▼"}</span>
              </button>
              {expanded && <div className="border-t-2 border-brand-50 px-4 py-4">{renderStep(s.n)}</div>}
            </li>
          );
        })}
      </ol>
    </div>
  );

  function renderStep(n: number) {
    if (n === 1) {
      if (visitRegistered) {
        return (
          <div className="space-y-2">
            <p className="text-base text-emerald-800">本次回診已登記（{today}）。</p>
            <Link href={`/cases/${caseId}#section-treatment`} className="text-base text-brand-700 underline">
              到個案頁補劑量、套組等細節 →
            </Link>
          </div>
        );
      }
      return (
        <RegisterVisitForm
          caseId={caseId}
          today={today}
          monthIndex={monthIndex}
          lesions={lesions}
          symptomOptions={symptomOptions}
          treatmentTypes={treatmentTypes}
        />
      );
    }

    if (n === 2) {
      return (
        <div className="space-y-3">
          {/* 回診要的是「現在長什麼樣」，所以判定一律限定當天——三個月前拍過照、
              量過尺寸，對這次回診沒有意義。 */}
          {todos.length > 0 && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
              <p className="text-base font-medium text-amber-900">本次尚未完成：</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-base text-amber-800">
                {todos.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {/* ⚠️ 已知取捨：新的尺寸會覆蓋上次的值，看不到病灶隨時間變小/變大。
              完整的時間序列是 pending.md E6，使用者決定先不做。 */}
          <p className="rounded-lg border border-brand-100 bg-paper-sunken px-3 py-2 text-sm text-ink/50">
            重新量測會<b>覆蓋上次的尺寸</b>（目前只存最新值，看不到歷次變化）。
            上次量測日：
            {lesions.map((l) => (
              <span key={l.id} className="ml-2 whitespace-nowrap font-data">
                {lesionLabel(l)} {l.measured_at ?? "未量測"}
              </span>
            ))}
          </p>
          <LesionMeasureFlow caseId={caseId} lesions={asLesionCheck} zones={zones} sex={sex} />
        </div>
      );
    }

    if (n === 3) {
      return (
        <div className="space-y-3">
          <p className="text-base text-ink/60">
            VSS 每次回診都要重測，才算得出跟上次比的 Delta。
            {monthIndex !== null && [12, 24].includes(monthIndex) && (
              <b className="text-ink">　本次是術後第 {monthIndex} 個月，另外加測 SF-36 與 PSQI。</b>
            )}
          </p>
          {missingScaleNames.length > 0 && (
            <p className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-base text-amber-900">
              後台找不到「{missingScaleNames.join("」「")}」，請先到問卷管理建立。
            </p>
          )}
          <div className="space-y-2">
            {scales.map((s) => (
              <Link
                key={s.id}
                href={`/patient/${caseId}/questionnaire?questionnaire_id=${s.id}&next=/cases/${caseId}/visit-flow`}
                className={`flex min-h-16 items-center justify-between gap-3 rounded-xl px-4 text-lg font-medium ${
                  s.done ? "border-2 border-emerald-300 bg-emerald-50 text-emerald-900" : "bg-brand-700 text-white"
                }`}
              >
                <span>{s.name}</span>
                <span className="shrink-0 text-base font-normal">{s.done ? "✓ 本次已填，點此重填" : "開始填 →"}</span>
              </Link>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {dueItems.length === 0 ? (
          <p className="text-base text-ink/60">沒有今天到期或逾期的待辦時程。</p>
        ) : (
          <ul className="space-y-2">
            {dueItems.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-brand-100 px-3 py-2 text-base"
              >
                <span className={item.due_date < today ? "text-red-600" : "text-ink/70"}>
                  {item.due_date} ・ {item.label}
                </span>
                <span className="ml-auto">
                  <CompleteScheduleItem caseId={caseId} itemId={item.id} />
                </span>
              </li>
            ))}
          </ul>
        )}
        {/* 下次回診日在個案頁的追蹤時程改——那裡看得到整條 24 個月的時間軸，
            只在這裡改一格容易把整串排程改歪。 */}
        <Link
          href={`/cases/${caseId}#section-schedule`}
          className="flex min-h-14 items-center justify-center rounded-xl border-2 border-brand-200 px-4 text-lg text-ink/80"
        >
          到個案頁調整追蹤時程 →
        </Link>
      </div>
    );
  }
}
