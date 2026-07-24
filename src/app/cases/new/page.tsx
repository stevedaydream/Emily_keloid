import { supabaseServer } from "@/lib/supabase";
import { createCaseAction } from "./actions";

export default async function NewCasePage() {
  const supabase = supabaseServer();
  const [{ data: doctors }, { data: templates }] = await Promise.all([
    supabase.from("doctors").select("id, code, name").eq("active", true).order("code"),
    supabase.from("schedule_templates").select("id, name").eq("active", true).order("name"),
  ]);

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">新增個案</h1>
      <p className="text-sm text-slate-500">
        研究編號將依「醫師代碼-年份-流水序號」規則自動產生，不需手動輸入。
      </p>
      <form action={createCaseAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div>
          <label className="block text-sm font-medium text-slate-700">負責醫師</label>
          <select
            name="doctor_id"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {(doctors ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">蟹足腫部位</label>
          <input
            name="body_site"
            placeholder="例：耳垂、胸口、下巴"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">病人手機號碼</label>
          <input
            name="phone_number"
            placeholder="供 LINE 綁定通知使用（不存姓名/病歷號）"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">套用追蹤時程範本</label>
          <select
            name="schedule_template_id"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">不套用（之後再手動設定）</option>
            {(templates ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            知情同意書已簽署日期
          </label>
          <input
            type="date"
            name="consent_signed_at"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-slate-400">
            紙本簽署流程不變，此欄位僅記錄狀態；未填代表尚未簽署。
          </p>
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          建立個案
        </button>
      </form>
    </div>
  );
}
