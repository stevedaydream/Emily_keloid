"use client";

import { useMemo, useState } from "react";
import {
  computePSQI,
  computeSF36,
  PSQI_CLOCK_ORDERS,
  PSQI_POOR_SLEEP_CUTOFF,
  SF36_DOC_TABLE,
  SF36_SCALES,
} from "@/lib/scoring";

export type CheckQuestion = {
  orderNo: number;
  text: string;
  type: string;
  options: { value: string; label: string }[];
};

type Answers = Record<number, string>;

const cell = "border border-brand-100 px-2 py-1 text-left align-top";
const numCell = "border border-brand-100 px-2 py-1 text-right font-data align-top";

/** 空字串要從 answers 拿掉，否則 computePSQI 的 num() 會把 "" 當成未作答但 SF-36 會算成 NaN */
function clean(answers: Answers): Record<number, unknown> {
  const out: Record<number, unknown> = {};
  for (const [k, v] of Object.entries(answers)) {
    if (v !== "") out[Number(k)] = v;
  }
  return out;
}

export default function ScoringCheckPanel({
  psqiQuestions,
  sf36Questions,
  prefill,
}: {
  psqiQuestions: CheckQuestion[];
  sf36Questions: CheckQuestion[];
  prefill: { kind: "psqi" | "sf36"; answers: Answers } | null;
}) {
  const [tab, setTab] = useState<"psqi" | "sf36">(prefill?.kind ?? "psqi");
  const [psqiAnswers, setPsqiAnswers] = useState<Answers>(prefill?.kind === "psqi" ? prefill.answers : {});
  const [sf36Answers, setSf36Answers] = useState<Answers>(prefill?.kind === "sf36" ? prefill.answers : {});

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["psqi", "sf36"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === k ? "bg-brand-700 text-white" : "border border-brand-200 text-brand-700 hover:bg-brand-50"
            }`}
          >
            {k === "psqi" ? "PSQI 睡眠品質量表" : "SF-36 健康調查簡表"}
          </button>
        ))}
      </div>

      {tab === "psqi" ? (
        <PsqiChecker questions={psqiQuestions} answers={psqiAnswers} setAnswers={setPsqiAnswers} />
      ) : (
        <Sf36Checker questions={sf36Questions} answers={sf36Answers} setAnswers={setSf36Answers} />
      )}
    </div>
  );
}

function QuestionInput({
  q,
  value,
  onChange,
}: {
  q: CheckQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  const base = "w-full rounded-md border border-brand-200 px-2 py-1 text-sm";
  if (q.options.length > 0) {
    return (
      <select className={base} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">（未作答）</option>
        {q.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (PSQI_CLOCK_ORDERS.includes(q.orderNo)) {
    return <input type="time" className={base} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <input
      type="text"
      className={base}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={q.type === "number" ? "數字" : ""}
    />
  );
}

function AnswerForm({
  questions,
  answers,
  setAnswers,
  skipOrders = [],
}: {
  questions: CheckQuestion[];
  answers: Answers;
  setAnswers: (a: Answers) => void;
  skipOrders?: number[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {questions
        .filter((q) => !skipOrders.includes(q.orderNo))
        .map((q) => (
          <label key={q.orderNo} className="block">
            <span className="block text-xs leading-snug text-ink/60">
              <span className="font-data text-ink/40">#{q.orderNo}</span> {q.text}
            </span>
            <span className="mt-0.5 block">
              <QuestionInput
                q={q}
                value={answers[q.orderNo] ?? ""}
                onChange={(v) => setAnswers({ ...answers, [q.orderNo]: v })}
              />
            </span>
          </label>
        ))}
    </div>
  );
}

function PsqiChecker({
  questions,
  answers,
  setAnswers,
}: {
  questions: CheckQuestion[];
  answers: Answers;
  setAnswers: (a: Answers) => void;
}) {
  const result = useMemo(() => computePSQI(clean(answers)), [answers]);
  // 文字說明題（5j 說明、11e 說明）不參與計分，驗算表單不用列
  const textOnly = questions.filter((q) => q.type === "text" && !PSQI_CLOCK_ORDERS.includes(q.orderNo));

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-brand-100 bg-paper-raised p-4">
        <h2 className="mb-3 text-sm font-medium text-ink/80">作答</h2>
        <AnswerForm questions={questions} answers={answers} setAnswers={setAnswers} skipOrders={textOnly.map((q) => q.orderNo)} />
        <p className="mt-3 text-xs text-ink/40">
          第10、11題（#20-#25）依 docx 指示不計入總分，只作描述性資料，所以下面的算式不會出現它們。
          純文字說明題（5j 說明、11e 說明）也不參與計分，這裡不列出。
        </p>
      </section>

      <section className="rounded-lg border border-brand-100 bg-paper-raised p-4">
        <h2 className="mb-3 text-sm font-medium text-ink/80">七大面向逐步計算</h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-brand-50/60 text-ink/60">
              <th className={cell}>面向</th>
              <th className={cell}>用到的題目與取值</th>
              <th className={cell}>換算方式</th>
              <th className={numCell}>分數</th>
            </tr>
          </thead>
          <tbody>
            {result.components.map((c) => (
              <tr key={c.key}>
                <td className={cell}>{c.label}</td>
                <td className={cell}>
                  {c.inputs.map((i) => (
                    <div key={i.label}>
                      {i.label}：<span className="font-data">{i.value}</span>
                    </div>
                  ))}
                </td>
                <td className={cell}>{c.formula}</td>
                <td className={numCell}>{c.score ?? "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-brand-50/60 font-medium">
              <td className={cell} colSpan={2}>
                總分（七個面向加總）
              </td>
              <td className={cell}>
                {result.components.map((c) => c.score ?? "?").join(" + ")}
              </td>
              <td className={numCell}>{result.global ?? "—"}</td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-3 text-sm">
          {result.global === null ? (
            <span className="text-amber-700">
              有面向缺資料，依設計不給總分（不用 0 頂替，避免低估）。上表分數欄為「—」的就是缺的那些。
            </span>
          ) : (
            <span className={result.poorSleep ? "text-red-700" : "text-ink/70"}>
              總分 {result.global} 分，判定門檻 ≥ {PSQI_POOR_SLEEP_CUTOFF} 分 →{" "}
              <strong>{result.poorSleep ? "有睡眠品質障礙" : "睡眠品質尚可"}</strong>
              {result.sleepEfficiencyPct !== null && `（睡眠效率 ${result.sleepEfficiencyPct.toFixed(1)}%）`}
            </span>
          )}
        </p>
        <p className="mt-2 text-xs text-ink/40">
          門檻取自 docx「5 分或 5 分以上即顯示有睡眠品質障礙」。這比 Buysse 原文的 &gt;5 寬一格——5 分整在原文算正常，
          在本研究算有障礙。
        </p>
      </section>
    </div>
  );
}

function Sf36Checker({
  questions,
  answers,
  setAnswers,
}: {
  questions: CheckQuestion[];
  answers: Answers;
  setAnswers: (a: Answers) => void;
}) {
  const result = useMemo(() => computeSF36(clean(answers)), [answers]);
  const questionText = useMemo(() => {
    const m: Record<number, string> = {};
    for (const q of questions) m[q.orderNo] = q.text;
    return m;
  }, [questions]);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-brand-100 bg-paper-raised p-4">
        <h2 className="mb-3 text-sm font-medium text-ink/80">作答</h2>
        <AnswerForm questions={questions} answers={answers} setAnswers={setAnswers} />
        <p className="mt-3 text-xs text-ink/40">
          第2題（跟一年前相比）不屬於八大構面中的任何一個，依標準計分法不列入任何構面分數。
        </p>
      </section>

      <section className="rounded-lg border border-brand-100 bg-paper-raised p-4">
        <h2 className="mb-1 text-sm font-medium text-ink/80">八大構面逐步計算</h2>
        <p className="mb-3 text-xs text-ink/50">
          公式：構面分數 =（實際得分 − 可能最低得分）÷ 分數範圍 × 100。
          加總前先把「1 分最健康」的反向題轉正（轉正值 = 層級數 + 1 − 原始值），讓所有題目都是分數越高越健康。
          第8題（疼痛干擾）是唯一的例外：它只有 5 個選項，但轉正後展開成 1–6 分，且「完全沒有影響」要看第7題
          有沒有疼痛才知道算 6 還是 5（第7題也沒答時取 6／4.75／3.5／2.25／1）。
        </p>
        <div className="space-y-4">
          {result.scales.map((s) => {
            const meta = SF36_SCALES.find((x) => x.key === s.key);
            const doc = SF36_DOC_TABLE[s.key];
            const derivedFull = s.details.reduce((acc, d) => acc + d.levels, 0);
            const docMismatch = doc && (doc.min !== s.details.length || doc.max !== derivedFull);
            return (
              <div key={s.key}>
                <h3 className="text-sm font-medium text-ink/80">
                  {meta?.docLabel}
                  <span className="ml-2 text-xs font-normal text-ink/40">（程式內名稱：{s.label}）</span>
                </h3>
                <table className="mt-1 w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-brand-50/60 text-ink/60">
                      <th className={cell}>題號</th>
                      <th className={cell}>題目</th>
                      <th className={numCell}>層級</th>
                      <th className={cell}>反向題</th>
                      <th className={numCell}>原始值</th>
                      <th className={numCell}>轉正值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.details.map((d) => (
                      <tr key={d.orderNo}>
                        <td className={numCell}>#{d.orderNo}</td>
                        <td className={cell}>{questionText[d.orderNo] ?? ""}</td>
                        <td className={numCell}>1–{d.levels}</td>
                        <td className={cell}>
                          {d.conditional ? "條件式（換算看第7題）" : d.reversed ? "是" : "否"}
                        </td>
                        <td className={numCell}>{d.raw ?? "—"}</td>
                        <td className={numCell}>{d.oriented ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-xs text-ink/70">
                  {s.score === null ? (
                    <span className="text-amber-700">整個構面都沒作答，不給分數。</span>
                  ) : (
                    <>
                      實際得分 {s.sum} − 最低 {s.min} = {(s.sum as number) - (s.min as number)}；
                      範圍 {s.range}；
                      <span className="font-data">
                        ({s.sum} − {s.min}) ÷ {s.range} × 100 = {s.score}
                      </span>
                      {s.answeredCount < s.totalItems && (
                        <span className="ml-1 text-amber-700">
                          （{s.totalItems} 題中只答了 {s.answeredCount} 題，最低分與範圍已按已答題目縮減計算）
                        </span>
                      )}
                    </>
                  )}
                </p>
                {docMismatch && (
                  <p className="mt-1 text-xs text-amber-700">
                    注意：docx 對照表寫「最低 {doc.min}／最高 {doc.max}／範圍 {doc.range}」，
                    但本問卷這個構面實際推導出的是「最低 {s.details.length}／最高 {derivedFull}／範圍{" "}
                    {derivedFull - s.details.length}」。計分以問卷實際選項為準——照 docx 的數字算，這個構面永遠拿不到 100 分。
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
