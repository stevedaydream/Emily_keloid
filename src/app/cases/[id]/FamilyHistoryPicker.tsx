"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

type Option = { id: string; label: string };

/**
 * 「都問過了，一項也沒有」（2026-08-26 助理要求）。
 *
 * 在這之前，個案頁的勾選視窗裡沒有任何方式表達這件事——把視窗關掉、欄位留空，
 * 跟「還沒問」在資料上完全一樣。病人自填流程其實早就有「以上都沒有」，
 * 且存進 cases.family_history 的就是這兩個字，所以這裡沿用同一個值，兩邊寫出來的資料一致。
 *
 * 匯出時對到代碼 0（見 structured-data/route.ts 的 codesFromText，以及 exportCodebook 的碼表說明）。
 */
const NONE_LABEL = "無";

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
      if (part === NONE_LABEL) {
        next.add(NONE_LABEL);
        continue;
      }
      const match = options.find((o) => o.label !== "其他" && o.label === part);
      if (match) next.add(match.label);
      else other = other ? `${other}、${part}` : part;
    }
    setChecked(next);
    setOtherText(other);
    setOpen(true);
  }

  /** 「無」與其他項目互斥：勾了「無」就清掉其他，勾了其他就清掉「無」。 */
  function toggle(label: string, on: boolean) {
    setChecked((prev) => {
      if (!on) {
        const next = new Set(prev);
        next.delete(label);
        return next;
      }
      if (label === NONE_LABEL) return new Set([NONE_LABEL]);
      const next = new Set(prev);
      next.delete(NONE_LABEL);
      next.add(label);
      return next;
    });
  }

  function apply() {
    if (checked.has(NONE_LABEL)) {
      setValue(NONE_LABEL);
      setOpen(false);
      return;
    }
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
                    onChange={(e) => toggle(o.label, e.target.checked)}
                  />
                  {o.label}
                </label>
              ))}
              {options.length === 0 && <p className="text-xs text-ink/40">後台尚未設定選項</p>}
              {/* 「無」不進後台選單清單（那份清單病人端也在用，那邊已經有「以上都沒有」了），
                  固定放在最後一列，並與上面所有項目互斥。 */}
              <label className="mt-1 flex items-center gap-2 border-t border-brand-50 pt-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={checked.has(NONE_LABEL)}
                  onChange={(e) => toggle(NONE_LABEL, e.target.checked)}
                />
                無（都問過了，一項也沒有）
              </label>
            </div>
            {checked.has("其他") && !checked.has(NONE_LABEL) && (
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
