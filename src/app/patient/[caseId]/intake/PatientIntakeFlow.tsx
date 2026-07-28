"use client";

import { useMemo, useState } from "react";
import { BigChoice, BigMultiChoice, type BigChoiceOption } from "@/components/senior/BigChoice";
import { TimeWheel, HoursWheel, YearWheel } from "@/components/senior/WheelPicker";
import BigNumpad from "@/components/senior/BigNumpad";
import Spinner from "@/components/ui/Spinner";
import {
  PATIENT_INTAKE_SEGMENTS,
  paginateQuestions,
  type PageableQuestion,
  type PatientIntakeSegmentKey,
} from "@/lib/patientIntake";
import {
  savePatientBasicAction,
  savePatientHistoryAction,
  savePatientIntakeOptionsAction,
  savePatientQuestionnaireAction,
} from "./actions";

type Option = { id: string; label: string };
type Questionnaire = { id: string; name: string; questions: PageableQuestion[] };
type Prior = "yes" | "no" | "unknown";

const YES_NO_UNKNOWN: BigChoiceOption[] = [
  { value: "no", label: "沒有做過" },
  { value: "yes", label: "有做過" },
  { value: "unknown", label: "不記得／不知道" },
];

// 「都沒有」「不知道」在複選題裡是互斥的特殊選項：選了就清掉其他勾選。
const NONE = "__none__";
const UNKNOWN = "__unknown__";

// PSQI 前四題不是選項題。這裡指定各自的元件，並且**寫回跟原本一模一樣的字串格式**
// （HH:MM／分鐘數／小時數），src/lib/scoring.ts 的 computePSQI 完全不用改。
const PSQI_SLEEP_LATENCY: BigChoiceOption[] = [
  { value: "10", label: "15 分鐘以內" },
  { value: "25", label: "16 到 30 分鐘" },
  { value: "45", label: "31 到 60 分鐘" },
  { value: "90", label: "超過 60 分鐘" },
];
/** 5j 是自由文字補充、且不列入 PSQI 計分，病人版直接略過。 */
const PSQI_SKIP_ORDER = 14;

type Screen = {
  segment: PatientIntakeSegmentKey;
  title: string;
  hint?: string;
  body: React.ReactNode;
  /** 單選類的畫面選完自動前進，長輩不用再找「下一步」 */
  autoAdvance?: boolean;
};

export default function PatientIntakeFlow({
  caseId,
  researchId,
  completedSegments,
  familyDiseaseOptions,
  keloidHistoryOptions,
  onsetCauseOptions,
  referralOptions,
  sf36,
  psqi,
}: {
  caseId: string;
  researchId: string;
  completedSegments: string[];
  familyDiseaseOptions: Option[];
  keloidHistoryOptions: Option[];
  onsetCauseOptions: Option[];
  referralOptions: Option[];
  sf36: Questionnaire | null;
  psqi: Questionnaire | null;
}) {
  // ── 各段的作答狀態 ────────────────────────────────────────────
  const [sex, setSex] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [phone, setPhone] = useState("");

  const [family, setFamily] = useState<string[]>([]);
  const [keloidHistory, setKeloidHistory] = useState<string[]>([]);
  const [onsetYear, setOnsetYear] = useState("");
  const [priors, setPriors] = useState<Record<string, Prior>>({});

  const [onsetCause, setOnsetCause] = useState<string[]>([]);
  const [referral, setReferral] = useState<string[]>([]);

  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const setAnswer = (qid: string, value: string | string[]) => setAnswers((a) => ({ ...a, [qid]: value }));

  // 複選題的互斥處理：選「都沒有」或「不知道」就把其他清掉，反之亦然。
  function toggleExclusive(next: string[], prev: string[]): string[] {
    const added = next.find((v) => !prev.includes(v));
    if (added === NONE || added === UNKNOWN) return [added];
    return next.filter((v) => v !== NONE && v !== UNKNOWN);
  }

  const multiOptions = (opts: Option[], extras: BigChoiceOption[]): BigChoiceOption[] => [
    ...opts.map((o) => ({ value: o.id, label: o.label })),
    ...extras,
  ];

  // ── 把整個流程攤平成一連串畫面 ──────────────────────────────
  const screens = useMemo<Screen[]>(() => {
    const list: Screen[] = [];

    list.push({
      segment: "basic",
      title: "您的性別是？",
      autoAdvance: true,
      body: (
        <BigChoice
          value={sex}
          onChange={setSex}
          options={[
            { value: "F", label: "女" },
            { value: "M", label: "男" },
            { value: "other", label: "其他" },
          ]}
        />
      ),
    });
    list.push({
      segment: "basic",
      title: "您是哪一年出生的？",
      hint: "上下滑動選擇年份",
      body: <YearWheel value={birthYear} onChange={setBirthYear} />,
    });
    list.push({
      segment: "basic",
      title: "您的手機號碼？",
      hint: "用於回診提醒。沒有手機可以直接按「下一步」跳過",
      body: <BigNumpad value={phone} onChange={setPhone} />,
    });

    list.push({
      segment: "history",
      title: "您的家人有沒有下列疾病？",
      hint: "可以複選",
      body: (
        <BigMultiChoice
          values={family}
          onChange={(v) => setFamily(toggleExclusive(v, family))}
          options={multiOptions(familyDiseaseOptions, [
            { value: NONE, label: "以上都沒有" },
            { value: UNKNOWN, label: "我不知道" },
          ])}
        />
      ),
    });
    list.push({
      segment: "history",
      title: "您的蟹足腫是怎麼來的？",
      hint: "可以複選",
      body: (
        <BigMultiChoice
          values={keloidHistory}
          onChange={(v) => setKeloidHistory(toggleExclusive(v, keloidHistory))}
          options={multiOptions(keloidHistoryOptions, [{ value: UNKNOWN, label: "我不知道" }])}
        />
      ),
    });
    list.push({
      segment: "history",
      title: "第一次發現蟹足腫是哪一年？",
      hint: "不記得的話直接按「下一步」，我們會請護理師再跟您確認",
      body: <YearWheel value={onsetYear} onChange={setOnsetYear} />,
    });
    for (const [key, label] of [
      ["prior_steroid_treatment", "以前有沒有打過類固醇針？"],
      ["prior_tcm_treatment", "以前有沒有看過中醫治療？"],
      ["prior_ogawa_patch", "以前有沒有貼過疤痕貼布？"],
      ["prior_radiation_treatment", "以前有沒有做過放射線（電療）？"],
    ] as const) {
      list.push({
        segment: "history",
        title: label,
        autoAdvance: true,
        body: (
          <BigChoice
            value={priors[key] ?? ""}
            onChange={(v) => setPriors((p) => ({ ...p, [key]: v as Prior }))}
            options={YES_NO_UNKNOWN}
          />
        ),
      });
    }

    list.push({
      segment: "intake_options",
      title: "您覺得蟹足腫是什麼原因造成的？",
      hint: "可以複選",
      body: (
        <BigMultiChoice
          values={onsetCause}
          onChange={(v) => setOnsetCause(toggleExclusive(v, onsetCause))}
          options={multiOptions(onsetCauseOptions, [{ value: UNKNOWN, label: "我不知道" }])}
        />
      ),
    });
    list.push({
      segment: "intake_options",
      title: "您是怎麼知道要來看這個門診的？",
      hint: "可以複選",
      body: (
        <BigMultiChoice
          values={referral}
          onChange={(v) => setReferral(toggleExclusive(v, referral))}
          options={multiOptions(referralOptions, [{ value: UNKNOWN, label: "想不起來" }])}
        />
      ),
    });

    // 問卷：依「選項數 × 題數」自動切頁，每頁按鈕不超過 10
    for (const [segment, q] of [
      ["sf36", sf36],
      ["psqi", psqi],
    ] as const) {
      if (!q) continue;
      const usable = q.questions.filter((x) => !(segment === "psqi" && x.order_no === PSQI_SKIP_ORDER));
      for (const page of paginateQuestions(usable)) {
        list.push({
          segment,
          title: page.length === 1 ? page[0].question_text : q.name,
          hint: page.length === 1 ? undefined : "請依序回答下列問題",
          body: (
            <div className="space-y-6">
              {page.map((question) => (
                <div key={question.id}>
                  {page.length > 1 && (
                    <p className="mb-2.5 text-lg font-medium leading-snug text-ink">{question.question_text}</p>
                  )}
                  {renderQuestion(segment, question, answers[question.id], (v) => setAnswer(question.id, v))}
                </div>
              ))}
            </div>
          ),
          autoAdvance: page.length === 1 && page[0].question_type === "single",
        });
      }
    }

    return list;
  }, [
    sex, birthYear, phone, family, keloidHistory, onsetYear, priors,
    onsetCause, referral, answers,
    familyDiseaseOptions, keloidHistoryOptions, onsetCauseOptions, referralOptions, sf36, psqi,
  ]);

  // 續填：從第一個「還沒完成的段落」的第一個畫面開始
  const firstUnfinished = useMemo(() => {
    const idx = screens.findIndex((s) => !completedSegments.includes(s.segment));
    return idx < 0 ? screens.length : idx;
  }, [screens, completedSegments]);

  const [index, setIndex] = useState<number | null>(null); // null = 還在歡迎畫面
  const allDone = completedSegments.length >= PATIENT_INTAKE_SEGMENTS.length;

  async function saveSegment(segment: PatientIntakeSegmentKey) {
    if (segment === "basic") {
      await savePatientBasicAction(caseId, { sex, birthYear: birthYear || null, phone });
    } else if (segment === "history") {
      await savePatientHistoryAction(caseId, {
        familyHistory: familyDiseaseOptions.filter((o) => family.includes(o.id)).map((o) => o.label),
        familyHistoryUnknown: family.includes(UNKNOWN),
        keloidHistoryOptionIds: keloidHistory.filter((v) => v !== NONE && v !== UNKNOWN),
        onsetYear: onsetYear || null,
        priors,
      });
    } else if (segment === "intake_options") {
      await savePatientIntakeOptionsAction(caseId, {
        onsetCauseIds: onsetCause.filter((v) => v !== NONE && v !== UNKNOWN),
        referralIds: referral.filter((v) => v !== NONE && v !== UNKNOWN),
      });
    } else if (segment === "sf36" && sf36) {
      await savePatientQuestionnaireAction(caseId, "sf36", { questionnaireId: sf36.id, answers });
    } else if (segment === "psqi" && psqi) {
      await savePatientQuestionnaireAction(caseId, "psqi", { questionnaireId: psqi.id, answers });
    }
  }

  async function goNext(from: number) {
    const current = screens[from];
    const next = screens[from + 1];
    // 跨段（或走完最後一段）時把這一段存起來——被打斷也只會丟掉當下這一段
    if (!next || next.segment !== current.segment) {
      setSaving(true);
      setError(null);
      try {
        await saveSegment(current.segment);
      } catch (e) {
        setError(e instanceof Error ? e.message : "儲存失敗，請告訴診間人員");
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    if (!next) setFinished(true);
    else setIndex(from + 1);
  }

  // ── 歡迎 / 完成畫面 ──────────────────────────────────────────
  if (finished || (index === null && allDone)) {
    return (
      <Shell>
        <div className="text-center">
          <p className="text-6xl">✓</p>
          <h1 className="mt-4 text-3xl font-semibold text-ink">已經填完了</h1>
          <p className="mt-3 text-xl leading-relaxed text-ink/70">
            謝謝您的配合。
            <br />
            請把平板交還給診間人員。
          </p>
        </div>
      </Shell>
    );
  }

  if (index === null) {
    const resuming = completedSegments.length > 0;
    return (
      <Shell>
        <div>
          <h1 className="text-3xl font-semibold leading-snug text-ink">
            {resuming ? "接著填寫" : "請您填寫幾個問題"}
          </h1>
          <p className="mt-4 text-xl leading-relaxed text-ink/70">
            這些問題只有您自己知道答案，會幫助醫師了解您的狀況。
            <br />
            一頁一個問題，選好會自動跳下一頁。
            <br />
            不確定的可以跳過，護理師之後會再問您。
          </p>
          <ol className="mt-6 space-y-2">
            {PATIENT_INTAKE_SEGMENTS.map((s) => {
              const done = completedSegments.includes(s.key);
              return (
                <li key={s.key} className="flex items-center gap-3 text-lg text-ink/80">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${
                      done ? "bg-emerald-500 text-white" : "border-2 border-brand-200 text-ink/40"
                    }`}
                  >
                    {done ? "✓" : ""}
                  </span>
                  <span className={done ? "text-ink/40 line-through" : ""}>{s.label}</span>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            onClick={() => setIndex(firstUnfinished >= screens.length ? 0 : firstUnfinished)}
            className="mt-8 min-h-16 w-full rounded-xl bg-brand-700 px-6 text-2xl font-medium text-white hover:bg-brand-800"
          >
            {resuming ? "繼續" : "開始"}
          </button>
        </div>
      </Shell>
    );
  }

  const screen = screens[index];
  const segmentMeta = PATIENT_INTAKE_SEGMENTS.find((s) => s.key === screen.segment);

  return (
    <Shell>
      <div className="flex min-h-[100dvh] flex-col">
        <div className="pt-2">
          <div className="flex items-baseline justify-between text-base text-ink/50">
            <span>{segmentMeta?.label}</span>
            <span className="tabular-nums">
              第 {index + 1} / {screens.length} 題
            </span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-brand-100">
            <div
              className="h-full rounded-full bg-brand-600 transition-all"
              style={{ width: `${((index + 1) / screens.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex-1 pt-8">
          <h1 className="text-2xl font-semibold leading-snug text-ink">{screen.title}</h1>
          {screen.hint && <p className="mt-2 text-lg leading-relaxed text-ink/60">{screen.hint}</p>}
          <div
            className="mt-6"
            // 單選畫面：選完短暫停頓讓病人看到打勾，再自動翻頁
            onClickCapture={() => {
              if (!screen.autoAdvance) return;
              setTimeout(() => goNext(index), 220);
            }}
          >
            {screen.body}
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-xl border-2 border-red-200 bg-red-50 p-4 text-lg text-red-700">{error}</p>
        )}

        <div className="sticky bottom-0 flex gap-3 bg-paper-raised py-4">
          <button
            type="button"
            onClick={() => setIndex(Math.max(0, index - 1))}
            disabled={index === 0 || saving}
            className="min-h-16 flex-1 rounded-xl border-2 border-brand-200 text-xl text-ink/70 disabled:opacity-40"
          >
            上一步
          </button>
          <button
            type="button"
            onClick={() => goNext(index)}
            disabled={saving}
            className="flex min-h-16 flex-[2] items-center justify-center gap-2 rounded-xl bg-brand-700 text-xl font-medium text-white hover:bg-brand-800 disabled:opacity-60"
          >
            {saving ? (
              <>
                <Spinner className="h-5 w-5" />
                儲存中…
              </>
            ) : index === screens.length - 1 ? (
              "完成"
            ) : (
              "下一步"
            )}
          </button>
        </div>
      </div>
      <p className="pb-3 text-center text-sm text-ink/30">{researchId}</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-paper-raised">
      <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col justify-center px-5">{children}</div>
    </div>
  );
}

// 依題型挑元件：選項 ≤ 6 用大按鈕，範圍大的才用履帶（決策 2026-07-29）。
function renderQuestion(
  segment: PatientIntakeSegmentKey,
  q: PageableQuestion,
  value: string | string[] | undefined,
  onChange: (v: string | string[]) => void
) {
  if (segment === "psqi") {
    if (q.order_no === 1 || q.order_no === 3) {
      return <TimeWheel value={typeof value === "string" ? value : ""} onChange={onChange} />;
    }
    if (q.order_no === 2) {
      return <BigChoice value={typeof value === "string" ? value : ""} onChange={onChange} options={PSQI_SLEEP_LATENCY} />;
    }
    if (q.order_no === 4) {
      return <HoursWheel value={typeof value === "string" ? value : ""} onChange={onChange} />;
    }
  }

  if (q.question_type === "multi") {
    return (
      <BigMultiChoice
        values={Array.isArray(value) ? value : []}
        onChange={onChange}
        options={q.options.map((o) => ({ value: o.value, label: o.label }))}
      />
    );
  }

  if (q.options.length > 0) {
    return (
      <BigChoice
        value={typeof value === "string" ? value : ""}
        onChange={onChange}
        options={q.options.map((o) => ({ value: o.value, label: o.label }))}
      />
    );
  }

  // 後台新增的數字題沒有選項時的保底：仍給大按鈕以外的輸入，但維持大字級
  return (
    <input
      type="number"
      inputMode="numeric"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-16 w-full rounded-xl border-2 border-brand-200 px-4 text-2xl"
    />
  );
}
