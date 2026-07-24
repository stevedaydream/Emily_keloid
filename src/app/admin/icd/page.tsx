import { supabaseServer } from "@/lib/supabase";
import { addIcdCodeAction, toggleIcdActiveAction } from "./actions";

export default async function IcdAdminPage() {
  const supabase = supabaseServer();
  const { data: codes } = await supabase.from("icd_codes").select("*").order("code");

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">ICD-9/10 常用碼清單</h1>
      <p className="text-sm text-slate-500">僅收錄蟹足腫相關的精簡常用碼，非完整 ICD 碼表。</p>

      <form action={addIcdCodeAction} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex gap-2">
          <select name="system" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="ICD9">ICD-9</option>
            <option value="ICD10">ICD-10</option>
          </select>
          <input name="code" placeholder="代碼，例：L91.0" required className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <input
          name="description_full"
          placeholder="完整診斷全文說明"
          required
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800">
          新增
        </button>
      </form>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {(codes ?? []).map((c) => (
          <li key={c.id} className="flex items-center justify-between px-4 py-2 text-sm">
            <span>
              [{c.system}] <b>{c.code}</b> — {c.description_full}
            </span>
            <form action={toggleIcdActiveAction}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="active" value={String(c.active)} />
              <button type="submit" className="text-xs text-slate-400 underline">
                {c.active ? "停用" : "啟用"}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
