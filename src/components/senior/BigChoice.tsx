"use client";

// 老年友善輸入元件（決策 2026-07-29）：
// 最小觸控目標 56px、整列可點、字級 ≥18px、不用淡灰當主要文字。
// 選項數 ≤ 6 一律用這個，不用滾輪——滾輪要持續按住拖曳，對手抖或不熟觸控的長輩反而難。

export type BigChoiceOption = { value: string; label: string; sublabel?: string };

export function BigChoice({
  options,
  value,
  onChange,
  columns = 1,
}: {
  options: BigChoiceOption[];
  value: string;
  onChange: (value: string) => void;
  /** 短選項（有／無／不知道）可以擠成一排，長句子維持一行一個 */
  columns?: 1 | 2 | 3;
}) {
  const gridClass = columns === 3 ? "grid-cols-3" : columns === 2 ? "grid-cols-2" : "grid-cols-1";
  return (
    <div className={`grid gap-2.5 ${gridClass}`}>
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={selected}
            className={`flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-lg leading-snug transition-colors ${
              selected
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-brand-200 bg-white text-ink hover:border-brand-400"
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                selected ? "border-white bg-white text-brand-700" : "border-brand-300"
              }`}
              aria-hidden
            >
              {selected ? "✓" : ""}
            </span>
            <span className="min-w-0">
              {o.label}
              {o.sublabel && (
                <span className={`block text-sm ${selected ? "text-white/80" : "text-ink/50"}`}>{o.sublabel}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 複選版本：同樣的視覺，但可以選多個。 */
export function BigMultiChoice({
  options,
  values,
  onChange,
}: {
  options: BigChoiceOption[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  function toggle(v: string) {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  }
  return (
    <div className="grid gap-2.5">
      {options.map((o) => {
        const selected = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            aria-pressed={selected}
            className={`flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-lg leading-snug transition-colors ${
              selected
                ? "border-brand-700 bg-brand-50 text-ink"
                : "border-brand-200 bg-white text-ink hover:border-brand-400"
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 ${
                selected ? "border-brand-700 bg-brand-700 text-white" : "border-brand-300"
              }`}
              aria-hidden
            >
              {selected ? "✓" : ""}
            </span>
            <span className="min-w-0">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
