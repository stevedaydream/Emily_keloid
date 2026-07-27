"use client";

import { useState } from "react";
import { addTreatmentRecordAction } from "./actions";

type FieldSchema = { key: string; label: string; type: string };
type TreatmentType = { id: string; name: string; field_schema: FieldSchema[] };
type Preset = { id: string; treatment_type_id: string; name: string; field_values: Record<string, string> };
export type LesionOption = { id: string; site_no: number | null; body_site: string; doseCategoryLabel: string | null };

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
  lesions,
}: {
  caseId: string;
  treatmentTypes: TreatmentType[];
  presets: Preset[];
  lesions: LesionOption[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedLesionIds, setSelectedLesionIds] = useState<string[]>([]);

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleLesion(id: string) {
    setSelectedLesionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const surgerySelected = selectedIds.some((id) => treatmentTypes.find((t) => t.id === id)?.name === "手術切除");

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

      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600">治療/追蹤日期</label>
          <input
            type="date"
            name="treatment_date"
            required
            className="mt-1 w-48 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* 部位：勾選的每個部位各建一筆紀錄，手術切除才能依各部位自己的劑量分類各排一組放療 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          部位（可複選，勾選的每個部位各建一筆紀錄）
        </label>
        {lesions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {lesions.map((l) => (
              <label
                key={l.id}
                className="flex items-center gap-1 whitespace-nowrap rounded border border-slate-200 px-2 py-1 text-xs"
              >
                <input
                  type="checkbox"
                  name="lesion_ids"
                  value={l.id}
                  checked={selectedLesionIds.includes(l.id)}
                  onChange={() => toggleLesion(l.id)}
                />
                部位{l.site_no} {l.body_site}
                <span className={l.doseCategoryLabel ? "text-slate-400" : "text-amber-600"}>
                  （{l.doseCategoryLabel ?? "未指定分類"}）
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            此個案尚未登記病灶部位，可在上方「現存病灶大小測量」以人形圖新增，或直接於下方自由輸入部位。
          </p>
        )}
        <div className="mt-2">
          <label className="block text-[11px] text-slate-500">其他部位（未登記在病灶清單者，自由輸入，另建一筆）</label>
          <input
            name="body_site"
            placeholder="例：左耳垂"
            className="mt-0.5 w-48 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        {surgerySelected && (
          <p className="mt-1.5 text-[11px] text-amber-700">
            已勾「手術切除」：送出後會為每個「已指定分類」的部位各產生一組放療排程（自由輸入的部位無分類，不會自動排程）。
          </p>
        )}
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
