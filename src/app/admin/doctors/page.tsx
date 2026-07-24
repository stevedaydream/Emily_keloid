import { supabaseServer } from "@/lib/supabase";
import { addDoctorAction, toggleDoctorActiveAction } from "./actions";

export default async function DoctorsAdminPage() {
  const supabase = supabaseServer();
  const { data: doctors } = await supabase.from("doctors").select("*").order("code");

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">醫師代碼清單</h1>
      <p className="text-sm text-slate-500">用於研究編號規則 [醫師代碼]-[年份]-[流水序號]。</p>

      <form action={addDoctorAction} className="flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="block text-xs font-medium text-slate-600">代碼</label>
          <input name="code" placeholder="例：CHN" required className="mt-1 w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">醫師姓名</label>
          <input name="name" required className="mt-1 w-48 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800">
          新增
        </button>
      </form>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {(doctors ?? []).map((d) => (
          <li key={d.id} className="flex items-center justify-between px-4 py-2 text-sm">
            <span>
              <b>{d.code}</b> — {d.name}
            </span>
            <form action={toggleDoctorActiveAction}>
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="active" value={String(d.active)} />
              <button type="submit" className="text-xs text-slate-400 underline">
                {d.active ? "停用" : "啟用"}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
