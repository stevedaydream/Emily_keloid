"use client";

import { useState } from "react";

const STATUS_OPTIONS = [
  { value: "yes", label: "有" },
  { value: "no", label: "無" },
  { value: "unknown", label: "不知道" },
];

/**
 * 把存回欄位的那串文字拆回畫面上的四格（2026-08-25）。
 *
 * 原本只認「無」「不知道」，其餘一律整串丟進備註——於是護理師填的日期/次數/劑量
 * 存成 `日期:2020-01-01；次數:3`，下次打開時那三格是空的、整串擠在備註裡，
 * 看起來就像存進去的資料不見了（使用者回報）。組合的格式是自己定的，就該自己拆得回來。
 *
 * 舊資料匯入的自由文字沒有這些前綴，會整串落在備註——與修改前的行為一致。
 */
function parseValue(raw: string) {
  if (!raw) return { status: "", date: "", count: "", dose: "", note: "" };
  if (raw === "無") return { status: "no", date: "", count: "", dose: "", note: "" };
  if (raw === "不知道") return { status: "unknown", date: "", count: "", dose: "", note: "" };

  const parts = raw.split("；");
  const take = (prefix: string) => {
    const i = parts.findIndex((p) => p.startsWith(prefix));
    if (i < 0) return "";
    return parts.splice(i, 1)[0].slice(prefix.length);
  };
  const date = take("日期:");
  const count = take("次數:");
  const dose = take("劑量:");
  // 剩下的就是備註。單獨一個「有」是「答有、但沒填細節」的組合結果，不是使用者打的字。
  const note = parts.join("；") === "有" ? "" : parts.join("；");
  return { status: "yes", date, count, dose, note };
}

// 「之前類固醇/中醫/小川令/放射治療史」共用元件：先選有/無/不知道，選「有」才展開日期/次數/劑量細節。
// 送出時組成一段文字寫回同一個舊有的文字欄位（例如 prior_steroid_treatment），沿用既有的
// updatePriorHistoryAction，不需要新的資料表或 action。
export default function PriorTreatmentPicker({
  name,
  label,
  defaultValue,
  anchorClassName = "",
}: {
  name: string;
  label: string;
  defaultValue: string;
  /** 待補清單點過來時要落在這一格，所以外層 div 需要 id 與 :target 高亮的樣式（2026-08-20） */
  anchorClassName?: string;
}) {
  const initial = parseValue(defaultValue);
  const [status, setStatus] = useState(initial.status);
  const [date, setDate] = useState(initial.date);
  const [count, setCount] = useState(initial.count);
  const [dose, setDose] = useState(initial.dose);
  const [note, setNote] = useState(initial.note);

  const composed =
    status === "no"
      ? "無"
      : status === "unknown"
      ? "不知道"
      : status === "yes"
      ? [date && `日期:${date}`, count && `次數:${count}`, dose && `劑量:${dose}`, note].filter(Boolean).join("；") || "有"
      : "";

  return (
    <div id={`field-${name}`} className={anchorClassName}>
      <label className="block text-xs font-medium text-ink/70">{label}</label>
      <input type="hidden" name={name} value={composed} />
      <div className="mt-1 flex flex-wrap gap-3">
        {STATUS_OPTIONS.map((o) => (
          <label key={o.value} className="flex items-center gap-1 whitespace-nowrap text-xs text-ink">
            <input
              type="radio"
              name={`${name}_status`}
              checked={status === o.value}
              onChange={() => setStatus(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
      {status === "yes" && (
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-brand-200 px-1.5 py-1 text-xs"
          />
          <input
            placeholder="次數"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="rounded-md border border-brand-200 px-1.5 py-1 text-xs"
          />
          <input
            placeholder="劑量"
            value={dose}
            onChange={(e) => setDose(e.target.value)}
            className="rounded-md border border-brand-200 px-1.5 py-1 text-xs"
          />
          <input
            placeholder="備註"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="col-span-3 rounded-md border border-brand-200 px-1.5 py-1 text-xs"
          />
        </div>
      )}
    </div>
  );
}
