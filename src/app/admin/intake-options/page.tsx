import { supabaseServer } from "@/lib/supabase";
import { addIntakeOptionAction, toggleIntakeOptionActiveAction, updateIntakeOptionAction, deleteIntakeOptionAction } from "./actions";
import SubmitButton from "@/components/ui/SubmitButton";
import EditableListItem from "@/components/admin/EditableListItem";

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
        <h1 className="font-heading text-xl font-medium text-brand-900">發生原因 / 得知看診 / 衛教選單</h1>
        <p className="mt-1 text-sm text-ink/50">
          個案頁面的「發生原因」「如何得知看診資訊」「飲食衛教」「運動禁忌衛教」都是複選這裡維護的清單，不是單純打勾。
        </p>
      </div>

      {CATEGORIES.map((cat) => (
        <section key={cat.key}>
          <h2 className="mb-2 text-sm font-semibold text-brand-900">{cat.label}</h2>
          <form action={addIntakeOptionAction} className="mb-2 flex items-end gap-2 rounded-lg border border-brand-100 bg-paper-raised p-3">
            <input type="hidden" name="category" value={cat.key} />
            <input name="label" placeholder="新增選項" required className="flex-1 rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
            <SubmitButton pendingText="新增中…">新增</SubmitButton>
          </form>
          <ul className="divide-y divide-brand-50 rounded-lg border border-brand-100 bg-paper-raised">
            {(options ?? [])
              .filter((o) => o.category === cat.key)
              .map((o) => (
                <li key={o.id}>
                  <EditableListItem
                    hidden={{ id: o.id }}
                    fields={[{ name: "label", label: "選項文字", defaultValue: o.label, className: "flex-1" }]}
                    updateAction={updateIntakeOptionAction}
                    deleteAction={deleteIntakeOptionAction}
                    trailing={
                      <form action={toggleIntakeOptionActiveAction}>
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="active" value={String(o.active)} />
                        <SubmitButton variant="ghost" size="sm" className="!px-0 !py-0 text-xs text-ink/40 underline hover:!bg-transparent" pendingText="處理中…">
                          {o.active ? "停用" : "啟用"}
                        </SubmitButton>
                      </form>
                    }
                  >
                    <span className={o.active ? "" : "text-ink/30 line-through"}>{o.label}</span>
                  </EditableListItem>
                </li>
              ))}
            {(options ?? []).filter((o) => o.category === cat.key).length === 0 && (
              <li className="px-4 py-2 text-sm text-ink/40">尚無選項</li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
