"use client";

import { useState } from "react";
import SubmitButton from "@/components/ui/SubmitButton";
import { addDiagnosisAction } from "./actions";

export type IcdOption = {
  id: string;
  code: string;
  system: string;
  description_full: string;
  mapping_key: string | null;
};

const systemLabel = (s: string) => (s === "ICD9" ? "ICD-9" : "ICD-10");

// ICD-9 ↔ ICD-10 雙向對照：共用同一個 mapping_key 的碼互為對照，
// 所以不論在選單選了哪一邊，都能即時把另一邊顯示出來（決策 2026-07-27，依院內對照表）。
export default function DiagnosisPicker({ caseId, codes }: { caseId: string; codes: IcdOption[] }) {
  const [selectedId, setSelectedId] = useState(codes[0]?.id ?? "");
  const selected = codes.find((c) => c.id === selectedId);
  const counterparts = selected?.mapping_key
    ? codes.filter((c) => c.mapping_key === selected.mapping_key && c.id !== selected.id)
    : [];

  return (
    <form action={addDiagnosisAction} className="space-y-2">
      <input type="hidden" name="case_id" value={caseId} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          name="icd_code_id"
          required
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full min-w-0 rounded-md border border-brand-200 px-2 py-1.5 text-sm sm:w-auto sm:flex-1"
        >
          {codes.map((c) => (
            <option key={c.id} value={c.id}>
              [{systemLabel(c.system)}] {c.code} {c.description_full}
            </option>
          ))}
        </select>
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <label className="flex items-center gap-1 whitespace-nowrap text-xs text-ink/50">
            <input type="checkbox" name="is_primary" /> 主診斷
          </label>
          <SubmitButton variant="outline" pendingText="新增中…">
            新增
          </SubmitButton>
        </div>
      </div>

      {selected && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand-50 bg-paper-raised px-3 py-2 text-xs">
          <span className="whitespace-nowrap rounded bg-brand-100 px-1.5 py-0.5 text-brand-800">
            {systemLabel(selected.system)}
          </span>
          <b className="font-data">{selected.code}</b>
          <span className="text-ink/60">{selected.description_full}</span>
          {counterparts.length > 0 ? (
            <>
              <span className="text-ink/30">↔</span>
              {counterparts.map((c) => (
                <span key={c.id} className="flex flex-wrap items-center gap-1">
                  <span className="whitespace-nowrap rounded bg-accent-100 px-1.5 py-0.5 text-accent-800">
                    {systemLabel(c.system)}
                  </span>
                  <b className="font-data">{c.code}</b>
                  <span className="text-ink/60">{c.description_full}</span>
                </span>
              ))}
            </>
          ) : (
            <span className="text-ink/30">（無對照碼，可至後台 ICD 維護頁填相同「對照鍵」建立對照）</span>
          )}
        </div>
      )}
    </form>
  );
}
