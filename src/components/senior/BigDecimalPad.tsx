"use client";

// 診間量測用的大數字鍵盤（2026-08-20）。跟 BigNumpad 的差別：
//   · 允許一個小數點（病灶尺寸是 3.2 這種）
//   · 同時服務多個欄位——長／寬／高共用一個鍵盤，打進「目前選中的那一格」
// 平板拿在手上、手指是濕的（剛戴過手套），所以鍵一律 ≥64px。

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

export default function BigDecimalPad({
  value,
  onChange,
  disabled = false,
}: {
  /** 純文字，可能含一個小數點；空字串代表未填 */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  function press(key: string) {
    if (disabled) return;
    if (key === "⌫") {
      onChange(value.slice(0, -1));
      return;
    }
    // 小數點只能有一個，且不讓它當開頭（`.5` 送進 Number() 會是 0.5，但顯示上很容易看錯）
    if (key === ".") {
      if (value.includes(".") || value.length === 0) return;
      onChange(`${value}.`);
      return;
    }
    // 小數點後只收一位：臨床上量到 0.1cm 已經是極限，多的位數是假精度
    const [, decimals] = value.split(".");
    if (decimals !== undefined && decimals.length >= 1) return;
    if (value.replace(".", "").length >= 4) return;
    onChange(value + key);
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((k, i) => (
        <button
          key={`${k}-${i}`}
          type="button"
          onClick={() => press(k)}
          disabled={disabled}
          className="min-h-16 rounded-xl border-2 border-brand-200 bg-white text-2xl font-medium text-ink active:bg-brand-100 disabled:opacity-40"
        >
          {k}
        </button>
      ))}
    </div>
  );
}
