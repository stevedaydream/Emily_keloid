"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

type Option = { id: string; label: string };

// 「Family（家族史）」欄位的輔助輸入工具：彈出視窗勾選常見家族疾病（後台可維護清單）＋「其他」自填，
// 按「帶入」後把勾選結果組成文字寫進同一個 family_history 文字框，實際儲存仍走原本「更新基本資料」按鈕，
// 不另外呼叫伺服器（家族病史是一次性資訊，不需要像飲食衛教那樣逐次記錄歷史）。
export default function FamilyHistoryPicker({
  name,
  title = "選擇常見疾病",
  options,
  defaultValue,
}: {
  name: string;
  title?: string;
  options: Option[];
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [otherText, setOtherText] = useState("");

  function openModal() {
    // 依目前文字內容粗略反推已勾選項目（用頓號/逗號切開比對），無法對應的片段歸到「其他」文字框。
    const parts = value.split(/[、,，]/).map((s) => s.trim()).filter(Boolean);
    const next = new Set<string>();
    let other = "";
    for (const part of parts) {
      const match = options.find((o) => o.label !== "其他" && o.label === part);
      if (match) next.add(match.label);
      else other = other ? `${other}、${part}` : part;
    }
    setChecked(next);
    setOtherText(other);
    setOpen(true);
  }

  function apply() {
    const labels = options.filter((o) => o.label !== "其他" && checked.has(o.label)).map((o) => o.label);
    if (checked.has("其他") && otherText.trim()) labels.push(otherText.trim());
    setValue(labels.join("、"));
    setOpen(false);
  }

  return (
    <div>
      <input
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
      />
      <button type="button" onClick={openModal} className="mt-1 text-xs text-brand-700 underline">
        從常見疾病清單選擇
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-paper-raised p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-sm font-semibold text-brand-900">{title}</h3>
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {options.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={checked.has(o.label)}
                    onChange={(e) =>
                      setChecked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(o.label);
                        else next.delete(o.label);
                        return next;
                      })
                    }
                  />
                  {o.label}
                </label>
              ))}
              {options.length === 0 && <p className="text-xs text-ink/40">後台尚未設定選項</p>}
            </div>
            {checked.has("其他") && (
              <input
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="請輸入其他疾病"
                className="mt-2 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
              />
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink/40 underline">
                取消
              </button>
              <Button type="button" size="sm" onClick={apply}>
                帶入
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
