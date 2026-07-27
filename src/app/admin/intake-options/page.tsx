import { supabaseServer } from "@/lib/supabase";
import { addIntakeOptionAction, toggleIntakeOptionActiveAction } from "./actions";

const CATEGORIES = [
  { key: "onset_cause", label: "發生原因" },
  { key: "referral_source", label: "如何得知看診資訊" },
  { key: "diet_education", label: "飲食衛教" },
  { key: "exercise_restriction", label: "運動禁忌衛教" },
] as const;

export default async function IntakeOptionsAdminPage() {
  const supabase = supabaseServer();
  const { data: options } = await supabase.from("case_intake_option_lists").select("*").order("category").order("sort_order");

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">發生原因 / 得知看診 / 衛教選單</h1>
        <p className="mt-1 text-sm text-slate-500">
          個案頁面的「發生原因」「如何得知看診資訊」「飲食衛教」「運動禁忌衛教」都是複選這裡維護的清單，不是單純打勾。
        </p>
      </div>

      {CATEGORIES.map((cat) => (
        <section key={cat.key}>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{cat.label}</h2>
          <form action={addIntakeOptionAction} className="mb-2 flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
            <input type="hidden" name="category" value={cat.key} />
            <input name="label" placeholder="新增選項" required className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <button type="submit" className="whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800">
              新增
            </button>
          </form>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {(options ?? [])
              .filter((o) => o.category === cat.key)
              .map((o) => (
                <li key={o.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className={o.active ? "" : "text-slate-400 line-through"}>{o.label}</span>
                  <form action={toggleIntakeOptionActiveAction}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="active" value={String(o.active)} />
                    <button type="submit" className="text-xs text-slate-400 underline">
                      {o.active ? "停用" : "啟用"}
                    </button>
                  </form>
                </li>
              ))}
            {(options ?? []).filter((o) => o.category === cat.key).length === 0 && (
              <li className="px-4 py-2 text-sm text-slate-400">尚無選項</li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
