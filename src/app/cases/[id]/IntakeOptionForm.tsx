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
  exclusiveLabel,
}: {
  caseId: string;
  category: string;
  options: Option[];
  alwaysShowNotes?: boolean;
  notesPlaceholder?: string;
  /** 與其他選項互斥的選項標籤（例如目前不適症狀的「無明顯不適」，docx 2026-08-12 明訂）。 */
  exclusiveLabel?: string;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const exclusiveId = exclusiveLabel ? options.find((o) => o.label === exclusiveLabel)?.id : undefined;
  const showDetail = alwaysShowNotes || options.some((o) => o.label.startsWith("其他") && checked.has(o.id));

  // 勾互斥項 → 清掉其他全部；勾其他任一項 → 取消互斥項。伺服器端另有一道相同的檢查。
  const toggle = (id: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (!on) {
        next.delete(id);
        return next;
      }
      if (exclusiveId && id === exclusiveId) return new Set([id]);
      if (exclusiveId) next.delete(exclusiveId);
      next.add(id);
      return next;
    });

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
              onChange={(e) => toggle(o.id, e.target.checked)}
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
