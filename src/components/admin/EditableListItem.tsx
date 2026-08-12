"use client";

import { useLayoutEffect, useRef, useState } from "react";
import SubmitButton from "@/components/ui/SubmitButton";

type Field = {
  name: string;
  label: string;
  defaultValue: string;
  type?: "text" | "textarea" | "select";
  options?: { value: string; label: string }[];
  className?: string;
  // 佔滿整列（等於自己獨佔一行），長文欄位用；預設是跟其他欄位擠同一行。
  fullWidth?: boolean;
};

// 高度跟著內容長短自動長／縮的 textarea：預設高度 rows 只是下限，
// 上限用 max-h 擋住（超過就內部捲動），使用者也還是可以自己拉大（resize-y）。
function AutoGrowTextarea({ className, ...props }: React.ComponentProps<"textarea">) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(resize, []);

  return <textarea ref={ref} onInput={resize} className={className} {...props} />;
}

// 通用的「檢視／編輯／刪除」清單項目：後台各種可維護清單（醫師、ICD碼、術語、操作者等）共用，
// 統一「編輯」在原地展開成表單、「刪除」跳確認對話框；若刪除對象已被個案資料引用（外鍵限制），
// 刪除會失敗但清單不會壞掉——這種情況請改用旁邊既有的「停用」。
export default function EditableListItem({
  hidden,
  fields,
  updateAction,
  deleteAction,
  trailing,
  children,
}: {
  hidden: Record<string, string>;
  fields: Field[];
  updateAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <form
        action={async (fd) => {
          await updateAction(fd);
          setEditing(false);
        }}
        className="flex flex-wrap items-end gap-2 bg-brand-50/50 px-4 py-2"
      >
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {fields.map((f) => (
          <div key={f.name} className={f.fullWidth ? "basis-full" : ""}>
            <label className="block text-xs font-medium text-ink/60">{f.label}</label>
            {f.type === "select" ? (
              <select
                name={f.name}
                defaultValue={f.defaultValue}
                className={`mt-1 rounded-md border border-brand-200 px-2 py-1 text-sm ${f.className ?? ""}`}
              >
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <AutoGrowTextarea
                name={f.name}
                defaultValue={f.defaultValue}
                rows={3}
                className={`mt-1 max-h-[60vh] min-h-24 resize-y overflow-auto rounded-md border border-brand-200 px-2 py-1 text-sm leading-relaxed sm:min-h-32 ${f.className ?? "w-56"}`}
              />
            ) : (
              <input
                name={f.name}
                defaultValue={f.defaultValue}
                className={`mt-1 rounded-md border border-brand-200 px-2 py-1 text-sm ${f.className ?? "w-40"}`}
              />
            )}
          </div>
        ))}
        <SubmitButton size="sm" pendingText="儲存中…">
          儲存
        </SubmitButton>
        <button type="button" onClick={() => setEditing(false)} className="whitespace-nowrap text-xs text-ink/40 underline">
          取消
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
      <div className="min-w-0">{children}</div>
      <div className="flex flex-wrap items-center gap-3">
        {trailing}
        <button type="button" onClick={() => setEditing(true)} className="whitespace-nowrap text-xs text-brand-700 underline">
          編輯
        </button>
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!confirm("確定要刪除嗎？此動作無法復原。若已被個案資料使用，刪除會失敗，請改用停用。")) e.preventDefault();
          }}
        >
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <SubmitButton
            variant="ghost"
            size="sm"
            className="!px-0 !py-0 text-xs text-red-500 underline hover:!bg-transparent hover:text-red-700"
            pendingText="刪除中…"
          >
            刪除
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
