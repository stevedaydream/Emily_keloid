"use client";

import { useState } from "react";

export type IcdOption = {
  id: string;
  code: string;
  system: string;
  description_full: string;
  mapping_key: string | null;
};

type SystemView = "ICD10" | "ICD9";

const SYSTEM_LABEL: Record<string, string> = { ICD9: "ICD-9", ICD10: "ICD-10" };

// 建檔頁的診斷區塊：跟個案頁的 DiagnosisSection 同樣用 ICD-9/ICD-10 開關當篩選器，
// 差別在於這裡個案還不存在，所以不呼叫 server action，只把選好的碼放進隱藏欄位隨建檔表單一起送出。
export default function DiagnosisPicker({ codes }: { codes: IcdOption[] }) {
  const [view, setView] = useState<SystemView>("ICD10");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [primaryId, setPrimaryId] = useState("");
  const [pendingId, setPendingId] = useState("");

  const visibleCodes = codes.filter((c) => c.system === view);
  const otherSystem: SystemView = view === "ICD10" ? "ICD9" : "ICD10";
  const codeById = new Map(codes.map((c) => [c.id, c]));

  const counterpartOf = (c: IcdOption | undefined, system: string) =>
    c?.mapping_key ? codes.find((x) => x.mapping_key === c.mapping_key && x.system === system) ?? null : null;

  // 選單目前指向的碼：切換系統後若原本指的碼不在清單中，退回第一筆
  const pending = visibleCodes.find((c) => c.id === pendingId) ?? visibleCodes[0] ?? null;

  function add() {
    if (!pending || selectedIds.includes(pending.id)) return;
    setSelectedIds((prev) => [...prev, pending.id]);
    // 第一筆預設為主診斷，之後可再改
    if (!primaryId) setPrimaryId(pending.id);
  }

  function remove(id: string) {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    if (primaryId === id) setPrimaryId("");
  }

  return (
    <div className="rounded-md border border-brand-100 p-3">
      {selectedIds.map((id) => (
        <input key={id} type="hidden" name="icd_code_ids" value={id} />
      ))}
      <input type="hidden" name="primary_icd_code_id" value={primaryId} />

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink/50">顯示系統</span>
        <div className="flex overflow-hidden rounded-md border border-brand-200 text-xs">
          {(["ICD10", "ICD9"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setView(s)}
              className={`whitespace-nowrap px-3 py-1 ${view === s ? "bg-brand-700 text-white" : "bg-white text-ink/70"}`}
            >
              {SYSTEM_LABEL[s]}
            </button>
          ))}
        </div>
        <span className="text-xs text-ink/40">可複選（主診斷＋共病），建檔後仍可在個案頁面增修</span>
      </div>

      <ul className="mb-2 space-y-1">
        {selectedIds.map((id) => {
          const c = codeById.get(id);
          const mate = counterpartOf(c, c?.system === "ICD10" ? "ICD9" : "ICD10");
          return (
            <li key={id} className="flex min-w-0 flex-wrap items-center gap-2 rounded bg-ink/5 px-2 py-1 text-xs">
              <span className="whitespace-nowrap rounded bg-brand-100 px-1.5 py-0.5 text-brand-800">
                {SYSTEM_LABEL[c?.system ?? ""] ?? "—"}
              </span>
              <b className="font-data">{c?.code}</b>
              <span className="min-w-0 flex-1 text-ink/60">{c?.description_full}</span>
              {mate && (
                <span className="whitespace-nowrap text-ink/40">
                  ↔ {SYSTEM_LABEL[mate.system]} <b className="font-data">{mate.code}</b>
                </span>
              )}
              <label className="flex items-center gap-1 whitespace-nowrap text-ink/50">
                <input type="radio" name="__primary_pick" checked={primaryId === id} onChange={() => setPrimaryId(id)} />
                主診斷
              </label>
              <button type="button" onClick={() => remove(id)} className="whitespace-nowrap text-red-500 underline">
                移除
              </button>
            </li>
          );
        })}
        {selectedIds.length === 0 && <li className="text-xs text-ink/40">尚未選擇診斷（可留空，建檔後再補）</li>}
      </ul>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={pending?.id ?? ""}
          onChange={(e) => setPendingId(e.target.value)}
          className="w-full min-w-0 rounded-md border border-brand-200 px-2 py-1.5 text-sm sm:flex-1"
        >
          {visibleCodes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} {c.description_full}
            </option>
          ))}
          {visibleCodes.length === 0 && <option value="">此系統尚無診斷碼，請至後台新增</option>}
        </select>
        <button
          type="button"
          onClick={add}
          disabled={!pending || selectedIds.includes(pending.id)}
          className="whitespace-nowrap rounded-md border border-brand-300 px-3 py-1.5 text-sm text-brand-800 hover:bg-brand-50 disabled:opacity-40"
        >
          ＋ 加入診斷
        </button>
      </div>

      {pending && (
        <p className="mt-1.5 text-[11px] text-ink/40">
          對照碼：
          {counterpartOf(pending, otherSystem)
            ? `${SYSTEM_LABEL[otherSystem]} ${counterpartOf(pending, otherSystem)!.code}`
            : `此碼沒有 ${SYSTEM_LABEL[otherSystem]} 對照（可至後台補上）`}
        </p>
      )}
    </div>
  );
}
