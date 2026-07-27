"use client";

import { useState } from "react";
import { addIntakeOptionRecordAction } from "./actions";
import SubmitButton from "@/components/ui/SubmitButton";

type Option = { id: string; label: string };

export default function IntakeOptionForm({
  caseId,
  category,
  options,
  alwaysShowNotes = false,
  notesPlaceholder = "請輸入「其他」的詳細原因/說明",
}: {
  caseId: string;
  category: string;
  options: Option[];
  alwaysShowNotes?: boolean;
  notesPlaceholder?: string;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const showDetail = alwaysShowNotes || options.some((o) => o.label.startsWith("其他") && checked.has(o.id));

  return (
    <form action={addIntakeOptionRecordAction} className="mb-2 space-y-2 rounded-md border border-brand-100 p-3">
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="category" value={category} />
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-1 whitespace-nowrap rounded border border-brand-200 px-2 py-1 text-xs">
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
        {options.length === 0 && <span className="text-xs text-ink/40">後台尚未設定選項</span>}
      </div>
      {showDetail && (
        <input
          name="notes"
          placeholder={notesPlaceholder}
          className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-xs"
        />
      )}
      <SubmitButton variant="outline" size="sm" pendingText="新增中…">
        新增紀錄
      </SubmitButton>
    </form>
  );
}
