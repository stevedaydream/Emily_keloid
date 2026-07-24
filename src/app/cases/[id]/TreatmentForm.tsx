"use client";

import { useMemo, useState } from "react";
import { addTreatmentRecordAction } from "./actions";

type FieldSchema = { key: string; label: string; type: string };
type TreatmentType = { id: string; name: string; field_schema: FieldSchema[] };
type Preset = { id: string; treatment_type_id: string; name: string; field_values: Record<string, string> };

export default function TreatmentForm({
  caseId,
  treatmentTypes,
  presets,
}: {
  caseId: string;
  treatmentTypes: TreatmentType[];
  presets: Preset[];
}) {
  const [typeId, setTypeId] = useState(treatmentTypes[0]?.id ?? "");
  const [presetId, setPresetId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});

  const currentType = useMemo(
    () => treatmentTypes.find((t) => t.id === typeId),
    [typeId, treatmentTypes]
  );
  const availablePresets = useMemo(
    () => presets.filter((p) => p.treatment_type_id === typeId),
    [typeId, presets]
  );
  const isOther = currentType?.name === "其他";

  function applyPreset(id: string) {
    setPresetId(id);
    const preset = presets.find((p) => p.id === id);
    if (preset) setValues(preset.field_values ?? {});
  }

  return (
    <form action={addTreatmentRecordAction} className="space-y-3 rounded-md border border-slate-200 p-4">
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="preset_id" value={presetId} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600">治療類型</label>
          <select
            name="treatment_type_id"
            value={typeId}
            onChange={(e) => {
              setTypeId(e.target.value);
              setPresetId("");
              setValues({});
            }}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {treatmentTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">套用套組（可選）</label>
          <select
            value={presetId}
            onChange={(e) => applyPreset(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            disabled={availablePresets.length === 0}
          >
            <option value="">不套用，手動輸入</option>
            {availablePresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!isOther && currentType?.field_schema?.length ? (
        <div className="grid grid-cols-2 gap-3">
          {currentType.field_schema.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-slate-600">{f.label}</label>
              <input
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                name={`field__${f.key}`}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          ))}
        </div>
      ) : (
        <div>
          <label className="block text-xs font-medium text-slate-600">說明（自由文字）</label>
          <textarea
            name="free_text"
            rows={2}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-600">治療日期</label>
        <input
          type="date"
          name="treatment_date"
          required
          className="mt-1 w-48 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>

      <button
        type="submit"
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
      >
        新增治療紀錄
      </button>
    </form>
  );
}
