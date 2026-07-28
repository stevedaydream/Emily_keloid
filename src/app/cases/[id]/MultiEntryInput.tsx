"use client";

import { useState } from "react";

// 一個欄位要記多筆的情況（例如之前治療過的醫師可能不只一位）：
// 畫面上是可增減的多列輸入，送出時合併成「、」分隔的字串寫回原本的單一文字欄位，
// 資料表結構與結構化匯出都不用改（欄位語意仍是同一欄）。
export default function MultiEntryInput({
  name,
  defaultValue,
  placeholder,
  addLabel = "＋ 新增一筆",
}: {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  addLabel?: string;
}) {
  const [items, setItems] = useState<string[]>(() => {
    const parsed = (defaultValue ?? "")
      .split("、")
      .map((s) => s.trim())
      .filter(Boolean);
    return parsed.length > 0 ? parsed : [""];
  });

  const combined = items.map((s) => s.trim()).filter(Boolean).join("、");

  function update(index: number, value: string) {
    setItems((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  return (
    <div className="mt-1 space-y-1">
      <input type="hidden" name={name} value={combined} />
      {items.map((value, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            value={value}
            onChange={(e) => update(i, e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
          />
          {items.length > 1 && (
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
              aria-label="移除這一筆"
              className="shrink-0 rounded-md border border-brand-200 px-2 py-1 text-xs text-ink/50 hover:border-red-300 hover:text-red-600"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setItems((prev) => [...prev, ""])}
        className="text-xs text-brand-700 underline"
      >
        {addLabel}
      </button>
    </div>
  );
}
