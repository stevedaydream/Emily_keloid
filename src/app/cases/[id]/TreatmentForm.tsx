"use client";

import { useState } from "react";
import { addTreatmentRecordAction } from "./actions";

type FieldSchema = { key: string; label: string; type: string };
type TreatmentType = { id: string; name: string; field_schema: FieldSchema[] };
type Preset = { id: string; treatment_type_id: string; name: string; field_values: Record<string, string> };

function TypeBlock({ type, presets }: { type: TreatmentType; presets: Preset[] }) {
  const [presetId, setPresetId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const isFreeform = (type.field_schema ?? []).length === 0;
  const availablePresets = presets.filter((p) => p.treatment_type_id === type.id);

  function applyPreset(id: string) {
    setPresetId(id);
    const preset = presets.find((p) => p.id === id);
    if (preset) setValues(preset.field_values ?? {});
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-semibold text-slate-600">{type.name}</p>
      <input type="hidden" name={`preset__${type.id}`} value={presetId} />
      {availablePresets.length > 0 && (
        <select
          value={presetId}
          onChange={(e) => applyPreset(e.target.value)}
          className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">不套用套組，手動輸入</option>
          {availablePresets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      {isFreeform ? (
        <textarea
          name={`freetext__${type.id}`}
          rows={2}
          placeholder="說明（自由文字，選填）"
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {type.field_schema.map((f) => (
            <div key={f.key}>
              <label className="block text-xs text-slate-500">{f.label}</label>
              <input
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                name={`field__${type.id}__${f.key}`}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TreatmentForm({
  caseId,
  treatmentTypes,
  presets,
}: {
  caseId: string;
  treatmentTypes: TreatmentType[];
  presets: Preset[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <form action={addTreatmentRecordAction} className="space-y-3 rounded-md border border-slate-200 p-4">
      <input type="hidden" name="case_id" value={caseId} />

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">治療/追蹤方式（可複選）</label>
        <div className="flex flex-wrap gap-2">
          {treatmentTypes.map((t) => (
            <label
              key={t.id}
              className="flex items-center gap-1 whitespace-nowrap rounded border border-slate-200 px-2 py-1 text-xs"
            >
              <input
                type="checkbox"
                name="type_ids"
                value={t.id}
                checked={selectedIds.includes(t.id)}
                onChange={() => toggle(t.id)}
              />
              {t.name}
            </label>
          ))}
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="space-y-2">
          {selectedIds.map((id) => {
            const type = treatmentTypes.find((t) => t.id === id);
            if (!type) return null;
            return <TypeBlock key={id} type={type} presets={presets} />;
          })}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-600">治療/追蹤日期</label>
        <input
          type="date"
          name="treatment_date"
          required
          className="mt-1 w-48 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>

      <div className="rounded-md border border-amber-100 bg-amber-50 p-3">
        <p className="mb-2 text-xs font-semibold text-amber-700">當次追蹤觀察</p>
        <label className="mb-1 flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" name="recurrence_observed" /> 觀察到復發
        </label>
        <textarea
          name="recurrence_description"
          rows={1}
          placeholder="復發情形描述（選填）"
          className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <label className="mb-1 flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" name="blood_drawn" /> 此次有抽血
        </label>
        <textarea
          name="blood_drawn_note"
          rows={1}
          placeholder="抽血備註（若非術前/術後第一天等常規時間點，請註記非常規原因）"
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={selectedIds.length === 0}
        className="whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
      >
        新增治療/追蹤紀錄
      </button>
    </form>
  );
}
