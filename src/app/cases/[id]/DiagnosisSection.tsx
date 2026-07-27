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

export type RecordedDiagnosis = {
  id: string;
  is_primary: boolean;
  icd: IcdOption | null;
};

type SystemView = "ICD10" | "ICD9";

const SYSTEM_LABEL: Record<string, string> = { ICD9: "ICD-9", ICD10: "ICD-10" };

// 診斷區塊：頂端的 ICD-9 / ICD-10 開關同時當作篩選器，
// 新增選單只列出目前切換到的系統的碼；已記錄的診斷也改用該系統的碼呈現
// （靠 mapping_key 換算成對照碼），對應的另一個系統的碼以次要文字附在後面。
export default function DiagnosisSection({
  caseId,
  codes,
  diagnoses,
}: {
  caseId: string;
  codes: IcdOption[];
  diagnoses: RecordedDiagnosis[];
}) {
  const [view, setView] = useState<SystemView>("ICD10");
  const visibleCodes = codes.filter((c) => c.system === view);
  const [selectedId, setSelectedId] = useState("");

  const counterpartOf = (c: IcdOption | null, system: string) =>
    c?.mapping_key ? codes.find((x) => x.mapping_key === c.mapping_key && x.system === system) ?? null : null;

  // 目前選單選到的碼（切換系統後若原本選的碼不在清單中，退回第一筆）
  const selected = visibleCodes.find((c) => c.id === selectedId) ?? visibleCodes[0] ?? null;
  const selectedMate = counterpartOf(selected, view === "ICD10" ? "ICD9" : "ICD10");

  const otherSystem: SystemView = view === "ICD10" ? "ICD9" : "ICD10";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink/50">顯示系統</span>
        <div className="flex overflow-hidden rounded-md border border-brand-200 text-xs">
          {(["ICD10", "ICD9"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setView(s)}
              className={`whitespace-nowrap px-3 py-1 ${
                view === s ? "bg-brand-700 text-white" : "bg-white text-ink/70"
              }`}
            >
              {SYSTEM_LABEL[s]}
            </button>
          ))}
        </div>
        <span className="text-xs text-ink/40">
          清單與已記錄診斷都只顯示 {SYSTEM_LABEL[view]} 的碼，對照碼附在後方
        </span>
      </div>

      <ul className="mb-3 space-y-1">
        {diagnoses.map((d) => {
          const stored = d.icd;
          // 已記錄的碼若不是目前切換的系統，就換算成對照碼顯示
          const shown = stored?.system === view ? stored : counterpartOf(stored, view);
          const mate = shown ? counterpartOf(shown, otherSystem) : null;
          return (
            <li key={d.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded bg-ink/5 px-2 py-1 text-xs">
              {shown ? (
                <>
                  <span className="whitespace-nowrap rounded bg-brand-100 px-1.5 py-0.5 text-brand-800">
                    {SYSTEM_LABEL[shown.system]}
                  </span>
                  <b className="font-data">{shown.code}</b>
                  <span className="text-ink/60">{shown.description_full}</span>
                  {mate && (
                    <span className="whitespace-nowrap text-ink/40">
                      ↔ {SYSTEM_LABEL[mate.system]} <b className="font-data">{mate.code}</b>
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="whitespace-nowrap rounded bg-ink/10 px-1.5 py-0.5 text-ink/50">
                    {stored ? SYSTEM_LABEL[stored.system] : "—"}
                  </span>
                  <b className="font-data">{stored?.code}</b>
                  <span className="text-ink/60">{stored?.description_full}</span>
                  <span className="whitespace-nowrap text-amber-600">（無 {SYSTEM_LABEL[view]} 對照碼）</span>
                </>
              )}
              {d.is_primary && <span className="whitespace-nowrap text-blue-600">（主診斷）</span>}
            </li>
          );
        })}
        {diagnoses.length === 0 && <li className="text-xs text-ink/40">尚未記錄診斷</li>}
      </ul>

      <form action={addDiagnosisAction} className="space-y-2">
        <input type="hidden" name="case_id" value={caseId} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            name="icd_code_id"
            required
            value={selected?.id ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full min-w-0 rounded-md border border-brand-200 px-2 py-1.5 text-sm sm:w-auto sm:flex-1"
          >
            {visibleCodes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} {c.description_full}
              </option>
            ))}
            {visibleCodes.length === 0 && <option value="">此系統尚無診斷碼，請至後台新增</option>}
          </select>
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            <label className="flex items-center gap-1 whitespace-nowrap text-xs text-ink/50">
              <input type="checkbox" name="is_primary" /> 主診斷
            </label>
            <SubmitButton variant="outline" disabled={visibleCodes.length === 0} pendingText="新增中…">
              新增
            </SubmitButton>
          </div>
        </div>

        {selected && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand-50 bg-paper-raised px-3 py-2 text-xs">
            <span className="whitespace-nowrap rounded bg-brand-100 px-1.5 py-0.5 text-brand-800">
              {SYSTEM_LABEL[selected.system]}
            </span>
            <b className="font-data">{selected.code}</b>
            <span className="text-ink/60">{selected.description_full}</span>
            <span className="text-ink/30">↔</span>
            {selectedMate ? (
              <>
                <span className="whitespace-nowrap rounded bg-accent-100 px-1.5 py-0.5 text-accent-800">
                  {SYSTEM_LABEL[selectedMate.system]}
                </span>
                <b className="font-data">{selectedMate.code}</b>
                <span className="text-ink/60">{selectedMate.description_full}</span>
              </>
            ) : (
              <span className="text-ink/30">此碼沒有 {SYSTEM_LABEL[otherSystem]} 對照（可至後台補上）</span>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
