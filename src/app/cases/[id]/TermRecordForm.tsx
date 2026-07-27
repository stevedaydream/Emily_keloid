"use client";

import { useState } from "react";
import SubmitButton from "@/components/ui/SubmitButton";
import { addTermRecordAction } from "./actions";

type Term = { id: string; stage: string; term: string };

const STAGE_OPTIONS = [
  { value: "pre", label: "術前" },
  { value: "intra", label: "術中" },
  { value: "post", label: "術後" },
] as const;

// 術語清單依選取的階段過濾（先前是不分階段全部列出、只在前面加階段標籤，
// 清單一長就很難找到該階段要用的術語）。切換階段時 checkbox 會重新掛載，
// 已勾的自然清空，避免送出到跟階段不符的術語。
export default function TermRecordForm({ caseId, terms }: { caseId: string; terms: Term[] }) {
  const [stage, setStage] = useState<string>("pre");
  const stageTerms = terms.filter((t) => t.stage === stage);
  const stageLabel = STAGE_OPTIONS.find((o) => o.value === stage)?.label ?? "";

  return (
    <form action={addTermRecordAction} className="mb-4 space-y-2 rounded-md border border-brand-100 p-3">
      <input type="hidden" name="case_id" value={caseId} />
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-ink/70">階段</label>
        <select
          name="stage"
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="rounded-md border border-brand-200 px-2 py-1 text-sm"
        >
          {STAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink/40">
          {stageTerms.length > 0 ? `${stageLabel}術語 ${stageTerms.length} 則（可複選）` : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {stageTerms.map((t) => (
          <label key={t.id} className="flex items-center gap-1 rounded border border-brand-100 px-2 py-1 text-xs">
            <input type="checkbox" name="term_ids" value={t.id} />
            {t.term}
          </label>
        ))}
        {stageTerms.length === 0 && (
          <p className="text-xs text-ink/40">此階段尚無術語，請至後台「醫學術語庫」新增</p>
        )}
      </div>
      <SubmitButton pendingText="新增中…">新增紀錄</SubmitButton>
    </form>
  );
}
