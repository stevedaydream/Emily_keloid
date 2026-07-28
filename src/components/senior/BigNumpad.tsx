"use client";

// 自製 0-9 大鍵盤（決策 2026-07-29）。
// 病人版唯一保留的「打字」欄位是手機號碼——不叫系統鍵盤是因為系統鍵盤在平板上
// 又小又會蓋掉半個畫面，長輩找不到數字鍵。這裡用 9 宮格大按鈕，順便鎖成只能輸入數字。

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

/** 09xx-xxx-xxx，純粹是顯示用的分隔，存回資料庫時仍是連續數字。 */
function formatPhone(digits: string): string {
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
}

export default function BigNumpad({
  value,
  onChange,
  maxLength = 10,
  placeholder = "09xx-xxx-xxx",
}: {
  /** 純數字字串（不含分隔符號） */
  value: string;
  onChange: (digits: string) => void;
  maxLength?: number;
  placeholder?: string;
}) {
  function press(key: string) {
    if (key === "⌫") {
      onChange(value.slice(0, -1));
      return;
    }
    if (!key || value.length >= maxLength) return;
    onChange(value + key);
  }

  return (
    <div className="space-y-3">
      <div
        className="flex min-h-16 items-center justify-center rounded-xl border-2 border-brand-200 bg-white px-4 text-2xl tabular-nums tracking-wider"
        aria-live="polite"
      >
        {value ? formatPhone(value) : <span className="text-ink/30">{placeholder}</span>}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {KEYS.map((key, i) =>
          key === "" ? (
            <span key={i} aria-hidden />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => press(key)}
              aria-label={key === "⌫" ? "刪除一個字" : key}
              className={`flex min-h-16 items-center justify-center rounded-xl border-2 text-2xl font-medium transition-colors ${
                key === "⌫"
                  ? "border-brand-200 bg-brand-50 text-ink/70 active:bg-brand-100"
                  : "border-brand-200 bg-white text-ink active:bg-brand-100"
              }`}
            >
              {key}
            </button>
          )
        )}
      </div>
    </div>
  );
}
