"use client";

import { useState } from "react";
import { addIntakeOptionRecordAction } from "./actions";
import SubmitButton from "@/components/ui/SubmitButton";

type Option = { id: string; label: string };

export default function IntakeOptionForm({
  caseId,
  category,
  options,
  defaultOptionIds = [],
  alwaysShowNotes = false,
  notesPlaceholder = "請輸入「其他」的詳細原因/說明",
  exclusiveLabel,
}: {
  caseId: string;
  category: string;
  options: Option[];
  /**
   * 目前值＝最新一筆紀錄勾了哪些（2026-08-24）。
   *
   * 這幾類是 append-only 的歷史紀錄，最新一筆就是現況；表單帶入現況、改完再存一筆，
   * 才跟隔壁「病人基本資料」那種會帶入值的欄位行為一致。原本一律空白的結果是
   * 病人在平板上選過的答案在個案頁看起來像整題沒填。
   * 呼叫端用最新紀錄的 id 當 key，存檔後才會重新掛載吃到新的預設值。
   */
  defaultOptionIds?: string[];
  alwaysShowNotes?: boolean;
  notesPlaceholder?: string;
  /** 與其他選項互斥的選項標籤（例如目前不適症狀的「無明顯不適」，docx 2026-08-12 明訂）。 */
  exclusiveLabel?: string;
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(defaultOptionIds));
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
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton variant="outline" size="sm" pendingText="儲存中…">
          {defaultOptionIds.length > 0 ? "儲存修改（新增一筆紀錄）" : "新增紀錄"}
        </SubmitButton>
        {defaultOptionIds.length > 0 && (
          <span className="text-xs text-ink/40">已帶入最新一筆的勾選，歷次紀錄仍完整保留在下方</span>
        )}
      </div>
    </form>
  );
}
