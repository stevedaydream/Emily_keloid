"use client";

import { useState } from "react";

const STATUS_OPTIONS = [
  { value: "yes", label: "有" },
  { value: "no", label: "無" },
  { value: "unknown", label: "不知道" },
];

function parseValue(raw: string) {
  if (!raw) return { status: "", note: "" };
  if (raw === "無") return { status: "no", note: "" };
  if (raw === "不知道") return { status: "unknown", note: "" };
  return { status: "yes", note: raw };
}

// 「之前類固醇/中醫/小川令/放射治療史」共用元件：先選有/無/不知道，選「有」才展開日期/次數/劑量細節。
// 送出時組成一段文字寫回同一個舊有的文字欄位（例如 prior_steroid_treatment），沿用既有的
// updatePriorHistoryAction，不需要新的資料表或 action。
export default function PriorTreatmentPicker({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  const initial = parseValue(defaultValue);
  const [status, setStatus] = useState(initial.status);
  const [date, setDate] = useState("");
  const [count, setCount] = useState("");
  const [dose, setDose] = useState("");
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
    <div>
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
