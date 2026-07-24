import { supabaseServer } from "@/lib/supabase";
import { addOperatorAction, toggleOperatorActiveAction } from "./actions";

export default async function OperatorsAdminPage() {
  const supabase = supabaseServer();
  const { data: operators } = await supabase.from("operators").select("*").order("name");

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">操作者清單</h1>
      <p className="text-sm text-slate-500">共用帳號登入後，選擇「目前操作者」用於稽核紀錄。</p>

      <form action={addOperatorAction} className="flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="block text-xs font-medium text-slate-600">姓名</label>
          <input name="name" required className="mt-1 w-40 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">角色（選填）</label>
          <input name="role" className="mt-1 w-40 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800">
          新增
        </button>
      </form>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {(operators ?? []).map((o) => (
          <li key={o.id} className="flex items-center justify-between px-4 py-2 text-sm">
            <span>
              {o.name} {o.role && <span className="text-xs text-slate-400">（{o.role}）</span>}
            </span>
            <form action={toggleOperatorActiveAction}>
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="active" value={String(o.active)} />
              <button type="submit" className="text-xs text-slate-400 underline">
                {o.active ? "停用" : "啟用"}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
