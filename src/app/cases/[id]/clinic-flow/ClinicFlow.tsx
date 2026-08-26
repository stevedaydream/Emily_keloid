"use client";

import { useState } from "react";
import Link from "next/link";
import LesionMeasureFlow from "./LesionMeasureFlow";
import { measureBlockers, jssHardBlocker, type ClinicianScale, type LesionCheck } from "@/lib/clinicFlow";
import { PATIENT_INTAKE_SEGMENTS } from "@/lib/patientIntake";
import type { BodyView } from "@/lib/bodyZones";

// 診間收案動線（決策 2026-08-20）。三步一頁，一次只展開一步：
//   1 病人自填（平板交出去）→ 2 量測長寬高＋拍照 → 3 醫師評分（JSS，評主病灶）
// 做完的步驟收成一行綠字，沒做完的自動展開。任何一步都點得回去——
// 門診會被打斷，硬性的精靈式流程反而讓人卡在中間出不來。

type Zone = { id: string; zone_key: string; view: BodyView; display_name: string; dose_category: string };

export default function ClinicFlow({
  caseId,
  researchId,
  intakeDone,
  lesions,
  zones,
  sex,
  scales,
  missingScaleNames,
}: {
  caseId: string;
  researchId: string;
  intakeDone: number;
  lesions: LesionCheck[];
  zones: Zone[];
  sex: string | null;
  /** 步驟 3 要填的醫師評分量表（JSS），依 CLINICIAN_SCALE_NAMES 的順序 */
  scales: ClinicianScale[];
  /** 後台找不到的量表名稱。缺了要講出來，不然那一份會靜悄悄地整個消失 */
  missingScaleNames: readonly string[];
}) {
  const intakeAllDone = intakeDone >= PATIENT_INTAKE_SEGMENTS.length;
  // JSS 評的是主病灶。沒勾的話（舊資料）退回「部位1」的慣例，但畫面上要講清楚是哪一顆。
  const primary = lesions.find((l) => l.is_primary) ?? lesions[0];
  const primaryLabel = primary ? `部位${primary.site_no ?? "?"} ${primary.body_site}` : "尚未登記病灶";
  const blockers = measureBlockers(lesions);
  const measureAllDone = blockers.length === 0;
  // 2026-08-26：步驟 3 由硬擋改軟擋——量測沒做完照樣點得開 JSS，只是上面警告哪幾題會變成用猜的。
  // 還會擋住的只剩「一顆病灶都沒登記」（那份 JSS 事後無從歸屬）。
  const jssBlocked = jssHardBlocker(lesions);
  // 清單裡的量表都填完才算走完這一步。scales 為空是「後台找不到量表」的異常狀況
  // （missingScaleNames 會把它講出來），不能當成完成。
  const scalesDone = scales.length > 0 && scales.every((s) => s.done);
  const allDone = intakeAllDone && measureAllDone && scalesDone;

  const steps = [
    { n: 1, title: "病人自填", done: intakeAllDone, hint: `${intakeDone}/${PATIENT_INTAKE_SEGMENTS.length} 段` },
    {
      n: 2,
      title: "病灶量測與拍照",
      done: measureAllDone,
      hint: `${lesions.length} 個部位`,
      // 收折成一行綠字之後，看起來就像「這一步結束了」——但一個病人可以有多顆病灶
      // （最多 5 顆），第二顆得再點開這一步、在人形圖上點下一個部位才拍得到。
      // 沒有這句提示，護理師沒有理由知道還能繼續（2026-08-25 使用者要求）。
      collapsedCta: lesions.length > 0 ? "還有其他部位要拍？點我展開，在人形圖上點下一個部位" : undefined,
    },
    {
      n: 3,
      title: "醫師評分",
      done: scalesDone,
      hint: `JSS 疤痕診斷分類表（評主病灶）・ 已完成 ${scales.filter((s) => s.done).length}/${scales.length} 份`,
    },
  ];
  const firstOpen = steps.find((s) => !s.done)?.n ?? 3;
  const [open, setOpen] = useState<number>(firstOpen);

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      <div>
        <h1 className="text-2xl font-semibold text-ink">診間收案動線</h1>
        <p className="mt-1 font-data text-sm text-ink/50">{researchId}</p>
      </div>

      {allDone && (
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-5 text-center">
          <p className="text-5xl">✓</p>
          <h2 className="mt-2 text-2xl font-semibold text-emerald-900">本次收案完成</h2>
          <p className="mt-1 text-base text-emerald-800">病人自填、病灶量測與拍照、醫師評分都已完成。</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/cases/${caseId}`}
              className="flex min-h-14 flex-1 items-center justify-center rounded-xl bg-brand-700 px-4 text-lg font-medium text-white"
            >
              看這位的個案頁
            </Link>
            <Link
              href="/intake"
              className="flex min-h-14 flex-1 items-center justify-center rounded-xl border-2 border-brand-200 px-4 text-lg text-ink/80"
            >
              收下一位
            </Link>
          </div>
        </div>
      )}

      <ol className="space-y-3">
        {steps.map((s) => {
          const expanded = open === s.n;
          return (
            <li key={s.n} className={`rounded-xl border-2 ${s.done ? "border-emerald-200 bg-emerald-50/40" : "border-brand-200 bg-white"}`}>
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
                  {/* 只在收折時出現：展開後人形圖就在眼前，再講一次是雜訊 */}
                  {s.collapsedCta && s.done && !expanded && (
                    <span className="mt-1 block text-base font-medium text-brand-700">↓ {s.collapsedCta}</span>
                  )}
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
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {PATIENT_INTAKE_SEGMENTS.map((seg, i) => (
              <span
                key={seg.key}
                className={`rounded px-2 py-0.5 text-sm ${i < intakeDone ? "bg-emerald-100 text-emerald-700" : "bg-ink/5 text-ink/40"}`}
              >
                {i < intakeDone ? "✓ " : ""}
                {seg.label}
              </span>
            ))}
          </div>
          <Link
            href={`/patient/${caseId}/intake`}
            className="flex min-h-14 items-center justify-center rounded-xl bg-brand-700 px-4 text-lg font-medium text-white"
          >
            {intakeDone === 0 ? "交平板給病人填" : intakeAllDone ? "重新填寫" : "繼續填"}
          </Link>
        </div>
      );
    }

    if (n === 2) {
      return (
        <div className="space-y-3">
          {/* 這一步做不完就走人，長寬高再也補不回來——照片裡的尺沒有被程式讀出來過（決策 #3）。
              所以缺什麼要直接列在眼前，不是藏在一個灰色的提示裡。 */}
          <p className="rounded-lg border-2 border-amber-200 bg-amber-50/60 px-3 py-2 text-base text-amber-900">
            這組長寬高就是<b>術前 baseline</b>，手術之後不會再量（病灶已切除）。
            現在沒量到，這位病人就永遠沒有病灶尺寸。
          </p>
          {blockers.length > 0 && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
              <p className="text-base font-medium text-amber-900">病人離開前要完成：</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-base text-amber-800">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          <LesionMeasureFlow caseId={caseId} lesions={lesions} zones={zones} sex={sex} />
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-base text-ink/60">
          由醫師觸診後填寫，評的是<b className="text-ink">主病灶（{primaryLabel}）</b>——
          JSS 有一半的題目在描述單一顆疤，多病灶的病人請確認主病灶勾對了（在個案頁的病灶清單改）。
          送出後會回到這一頁。
        </p>

        {missingScaleNames.length > 0 && (
          <p className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-base text-amber-900">
            後台找不到「{missingScaleNames.join("」「")}」，請先到問卷管理建立，否則這一份收不到。
          </p>
        )}

        {jssBlocked ? (
          <>
            <button
              type="button"
              disabled
              className="min-h-16 w-full cursor-not-allowed rounded-xl bg-ink/10 px-4 text-xl font-medium text-ink/35"
            >
              請先在步驟 2 登記病灶部位
            </button>
            <p className="text-base text-ink/50">{jssBlocked}。在上一步的人形圖上點一個部位就會建立。</p>
          </>
        ) : (
          <div className="space-y-2">
            {/* 量測沒做完不再擋住這一步（2026-08-26），但要講清楚代價：
                JSS 的第 7、8 題直接問大小與垂直生長，沒量就只能用猜的。 */}
            {!measureAllDone && (
              <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
                <p className="text-base font-medium text-amber-900">
                  ⚠️ 步驟 2 還沒做完，JSS 的「7. 大小」「8. 垂直生長」只能用猜的：
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-base text-amber-800">
                  {blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <p className="mt-1.5 text-sm text-amber-800/80">
                  量得到就先回上一步量。真的量不到（病人拒絕、位置量不著）就在該部位勾
                  「無法量測／拒絕拍照」填原因，系統會留一筆待補提醒。
                </p>
              </div>
            )}
            {scales.map((s) => (
              <Link
                key={s.id}
                href={`/patient/${caseId}/questionnaire?questionnaire_id=${s.id}&next=/cases/${caseId}/clinic-flow`}
                className={`flex min-h-16 items-center justify-between gap-3 rounded-xl px-4 text-lg font-medium ${
                  s.done ? "border-2 border-emerald-300 bg-emerald-50 text-emerald-900" : "bg-brand-700 text-white"
                }`}
              >
                <span>{s.name}</span>
                <span className="shrink-0 text-base font-normal">
                  {s.done ? "✓ 已完成，點此重填" : measureAllDone ? "開始填 →" : "還是要現在填 →"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }
}
