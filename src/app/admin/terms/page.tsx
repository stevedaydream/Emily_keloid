import { supabaseServer } from "@/lib/supabase";
import { addTermAction, toggleTermActiveAction } from "./actions";

const STAGE_LABEL: Record<string, string> = { pre: "術前", intra: "術中", post: "術後" };

export default async function TermsAdminPage() {
  const supabase = supabaseServer();
  const { data: terms } = await supabase.from("term_library").select("*").order("stage").order("sort_order");

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">醫學術語庫</h1>
      <p className="text-sm text-slate-500">依術前/術中/術後分類，記錄時可複選；示意圖用網址連結（demo 簡化，正式版可改為上傳）。</p>

      <form action={addTermAction} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex gap-2">
          <select name="stage" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="pre">術前</option>
            <option value="intra">術中</option>
            <option value="post">術後</option>
          </select>
          <input name="term" placeholder="術語文字" required className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <input name="image_url" placeholder="示意圖網址（選填）" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800">
          新增
        </button>
      </form>

      {(["pre", "intra", "post"] as const).map((stage) => (
        <div key={stage}>
          <h2 className="mb-1 text-sm font-semibold text-slate-700">{STAGE_LABEL[stage]}</h2>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {(terms ?? [])
              .filter((t) => t.stage === stage)
              .map((t) => (
                <li key={t.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>
                    {t.term} {t.image_url && <span className="text-xs text-slate-400">（有示意圖）</span>}
                  </span>
                  <form action={toggleTermActiveAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="active" value={String(t.active)} />
                    <button type="submit" className="text-xs text-slate-400 underline">
                      {t.active ? "停用" : "啟用"}
                    </button>
                  </form>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
