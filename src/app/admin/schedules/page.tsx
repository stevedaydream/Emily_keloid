import { supabaseServer } from "@/lib/supabase";
import { addScheduleTemplateAction, addScheduleItemAction } from "./actions";

export default async function SchedulesAdminPage() {
  const supabase = supabaseServer();
  const [{ data: templates }, { data: items }, { data: questionnaires }] = await Promise.all([
    supabase.from("schedule_templates").select("*").order("name"),
    supabase.from("schedule_template_items").select("*").order("sort_order"),
    supabase.from("questionnaire_templates").select("id, name").eq("active", true),
  ]);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">追蹤時程範本</h1>
        <p className="text-sm text-slate-500">建立個案時套用範本，個案上仍可個別微調，範本本身不寫死。</p>
      </div>

      <form action={addScheduleTemplateAction} className="flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-4">
        <input name="name" placeholder="範本名稱，例：標準術後追蹤" required className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800">
          新增範本
        </button>
      </form>

      {(templates ?? []).map((t) => (
        <section key={t.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{t.name}</h2>
          <ul className="mb-3 space-y-1">
            {(items ?? [])
              .filter((i) => i.template_id === t.id)
              .map((i) => (
                <li key={i.id} className="text-sm text-slate-600">
                  {i.label}（第 {i.offset_days} 天）・ {(i.actions ?? []).join("、")}
                </li>
              ))}
          </ul>
          <form action={addScheduleItemAction} className="grid grid-cols-2 gap-2">
            <input type="hidden" name="template_id" value={t.id} />
            <input name="label" placeholder="時間點名稱，例：第2週" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <input name="offset_days" type="number" placeholder="相對天數" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" name="actions" value="questionnaire" /> 填問卷
            </label>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" name="actions" value="photo" /> 拍照提醒
            </label>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" name="actions" value="visit_reminder" /> 回診提醒
            </label>
            <select name="questionnaire_id" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">（若含填問卷，選擇問卷）</option>
              {(questionnaires ?? []).map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
            <button type="submit" className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
              新增時間點
            </button>
          </form>
        </section>
      ))}
    </div>
  );
}
