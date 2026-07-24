import { supabaseServer } from "@/lib/supabase";
import { addTreatmentTypeAction, addPresetAction } from "./actions";

export default async function TreatmentsAdminPage() {
  const supabase = supabaseServer();
  const [{ data: types }, { data: presets }] = await Promise.all([
    supabase.from("treatment_types").select("*").order("sort_order"),
    supabase.from("treatment_presets").select("*, treatment_types(name)").order("created_at"),
  ]);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">治療類型與套組</h1>
        <p className="text-sm text-slate-500">
          每種治療類型可定義結構化欄位；常用參數組合可存成套組，看診時一鍵帶入。
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">治療類型</h2>
        <form action={addTreatmentTypeAction} className="mb-3 space-y-2 rounded-lg border border-slate-200 bg-white p-4">
          <input name="name" placeholder="治療類型名稱" required className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <textarea
            name="field_schema"
            rows={2}
            placeholder='欄位定義（JSON），例：[{"key":"dose","label":"劑量","type":"number"}]'
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs"
          />
          <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800">
            新增治療類型
          </button>
        </form>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {(types ?? []).map((t) => (
            <li key={t.id} className="px-4 py-2 text-sm">
              <b>{t.name}</b>
              <span className="ml-2 text-xs text-slate-400">
                {(t.field_schema ?? []).map((f: { label: string }) => f.label).join("、") || "（無結構化欄位，使用自由文字）"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">治療套組（可維護、可自訂名稱）</h2>
        <form action={addPresetAction} className="mb-3 space-y-2 rounded-lg border border-slate-200 bg-white p-4">
          <select name="treatment_type_id" required className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            {(types ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input name="name" placeholder="套組名稱，例：標準病灶內注射-A方案" required className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <textarea
            name="field_values"
            rows={2}
            placeholder='套組內容（JSON），例：{"drug":"Triamcinolone","dose":1}'
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs"
          />
          <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800">
            新增套組
          </button>
        </form>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {(presets ?? []).map((p) => {
            const tt = Array.isArray(p.treatment_types) ? p.treatment_types[0] : p.treatment_types;
            return (
              <li key={p.id} className="px-4 py-2 text-sm">
                <b>{p.name}</b>
                <span className="ml-2 text-xs text-slate-400">
                  （{tt?.name}）{Object.entries(p.field_values ?? {}).map(([k, v]) => `${k}=${v}`).join(", ")}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
