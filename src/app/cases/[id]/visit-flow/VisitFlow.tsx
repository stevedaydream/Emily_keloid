"use client";

import { useState } from "react";
import Link from "next/link";
import LesionMeasureFlow from "../clinic-flow/LesionMeasureFlow";
import RegisterVisitForm, { CompleteScheduleItem } from "./RegisterVisitForm";
import {
  measuredToday,
  visitLesionTodos,
  lesionLabel,
  followupTimepoints,
  TIMEPOINT_TOLERANCE_DAYS,
  type FollowupTimepoint,
  type VisitLesion,
} from "@/lib/visitFlow";
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
  timepoint,
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
  /** 本次回診落在哪個追蹤時間點的窗期（術後滿 1/6/12 個月 ±10 天）；null ＝ 一般回診 */
  timepoint: FollowupTimepoint | null;
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
  // 已登記手術＝病灶被切掉了，術後回診只拍照不量尺寸（助理 2026-08-24）。
  const postOp = surgeryDate !== null && today >= surgeryDate;
  const todos = visitLesionTodos(lesions, today, postOp);
  const lesionsDone = todos.length === 0;
  // 不在追蹤時間點的窗期上就沒有量表要測，這一步直接算完成（不是「沒東西可做但卡著」）。
  const scalesDone = timepoint === null || (scales.length > 0 && scales.every((s) => s.done));
  const wrapUpDone = dueItems.length === 0;
  const allDone = visitRegistered && lesionsDone && scalesDone && wrapUpDone;
  const nextTimepoints = followupTimepoints(surgeryDate).filter((t) => t.windowEnd >= today);

  const steps = [
    { n: 1, title: "登記本次回診", done: visitRegistered, hint: visitRegistered ? `${today} 已登記` : "沒登記＝匯出檔視同沒回診" },
    {
      n: 2,
      title: postOp ? "拍照" : "重新量測與拍照",
      done: lesionsDone,
      hint: postOp
        ? `${lesions.filter((l) => l.photoCountToday > 0).length}/${lesions.length} 個部位本次已拍照`
        : `${lesions.filter((l) => measuredToday(l, today)).length}/${lesions.length} 個部位本次已量測`,
    },
    {
      n: 3,
      title: "追蹤量表",
      done: scalesDone,
      hint: timepoint
        ? `${timepoint.label}：${scales.map((s) => s.name.replace("（PSQI）", "").replace(" 健康調查簡表", "")).join(" ＋ ")}`
        : nextTimepoints[0]
          ? `本次不用測 ・ 下一個時間點 ${nextTimepoints[0].anchor}（${nextTimepoints[0].label}）`
          : "本次不用測",
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
    is_primary: l.is_primary,
    // 術後只拿來顯示 baseline；術前一律當成「本次還沒量」（回診要的是現在的尺寸）
    length_cm: postOp ? l.length_cm : null,
    width_cm: postOp ? l.width_cm : null,
    height_cm: postOp ? l.height_cm : null,
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
          {/* 尺寸只收術前 baseline（助理 2026-08-24）：手術把病灶切掉了，術後量到的是疤痕，
              寫回去會把 baseline 蓋掉。所以術後這一步只剩拍照。 */}
          <p className="rounded-lg border border-brand-100 bg-paper-sunken px-3 py-2 text-sm text-ink/50">
            {postOp ? (
              <>
                已登記手術（{surgeryDate}），<b>術後不再量尺寸</b>——長寬高只保留術前 baseline。
                本次只要拍照。baseline 量測日：
              </>
            ) : (
              <>
                尚未手術，這次量到的會<b>覆蓋上一組尺寸</b>；手術前最後一次量的就是 baseline。
                上次量測日：
              </>
            )}
            {lesions.map((l) => (
              <span key={l.id} className="ml-2 whitespace-nowrap font-data">
                {lesionLabel(l)} {l.measured_at ?? "未量測"}
              </span>
            ))}
          </p>
          <LesionMeasureFlow
            caseId={caseId}
            lesions={asLesionCheck}
            zones={zones}
            sex={sex}
            photoOnly={postOp}
            backTo={`/cases/${caseId}/visit-flow`}
          />
        </div>
      );
    }

    if (n === 3) {
      if (!timepoint) {
        return (
          <div className="space-y-3">
            <p className="text-base text-ink/60">
              追蹤量表只在<b className="text-ink">術後滿 1、6、12 個月</b>各測一次（前後 {TIMEPOINT_TOLERANCE_DAYS} 天內回診都算），
              本次不在窗期內，不用測。
            </p>
            {nextTimepoints.length > 0 ? (
              <ul className="space-y-1 text-base text-ink/70">
                {nextTimepoints.map((t) => (
                  <li key={t.months} className="font-data">
                    {t.label}：{t.anchor}
                    <span className="ml-2 text-sm text-ink/40">
                      （{t.windowStart} ～ {t.windowEnd} 都算）
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-base text-ink/50">
                {surgeryDate ? "三個追蹤時間點都已經過了。" : "尚未登記手術，時間點要等手術日確定後才算得出來。"}
              </p>
            )}
            {/* 窗期外仍然填得到：日期沒對上不代表病人沒來，只是匯出時會標成「窗期外」 */}
            <details className="text-sm text-ink/50">
              <summary className="cursor-pointer">還是要在今天補填量表？</summary>
              <p className="mt-1">
                到個案頁的問卷區塊直接開就填得到。填了不會被丟掉，匯出的「問卷分數」分頁會標成
                <b>窗期外</b>並附上距手術第幾天。
              </p>
              <Link href={`/cases/${caseId}#section-questionnaire`} className="text-brand-700 underline">
                到個案頁問卷區塊 →
              </Link>
            </details>
          </div>
        );
      }
      return (
        <div className="space-y-3">
          <p className="text-base text-ink/60">
            本次是<b className="text-ink">{timepoint.label}</b>（標準日 {timepoint.anchor}，
            {timepoint.windowStart} ～ {timepoint.windowEnd} 都算），三份量表一起測。
            JSS 由醫師評<b className="text-ink">主病灶</b>，SF-36 與 PSQI 交給病人自己填。
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
