"use client";

import { useState } from "react";
import { addIntakeOptionRecordAction } from "./actions";

type Option = { id: string; label: string };

export default function IntakeOptionForm({
  caseId,
  category,
  options,
}: {
  caseId: string;
  category: string;
  options: Option[];
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const showDetail = options.some((o) => o.label.startsWith("其他") && checked.has(o.id));

  return (
    <form action={addIntakeOptionRecordAction} className="mb-2 space-y-2 rounded-md border border-slate-100 p-3">
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="category" value={category} />
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-1 whitespace-nowrap rounded border border-slate-200 px-2 py-1 text-xs">
            <input
              type="checkbox"
              name="option_ids"
              value={o.id}
              checked={checked.has(o.id)}
              onChange={(e) =>
                setChecked((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(o.id);
                  else next.delete(o.id);
                  return next;
                })
              }
            />
            {o.label}
          </label>
        ))}
        {options.length === 0 && <span className="text-xs text-slate-400">後台尚未設定選項</span>}
      </div>
      {showDetail && (
        <input
          name="notes"
          placeholder="請輸入「其他」的詳細原因/說明"
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
        />
      )}
      <button type="submit" className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50">
        新增紀錄
      </button>
    </form>
  );
}
