import { supabaseServer } from "@/lib/supabase";
import { addTermAction, toggleTermActiveAction, updateTermAction, deleteTermAction } from "./actions";
import SubmitButton from "@/components/ui/SubmitButton";
import EditableListItem from "@/components/admin/EditableListItem";

const STAGE_LABEL: Record<string, string> = { pre: "術前", intra: "術中", post: "術後" };
const STAGE_OPTIONS = [
  { value: "pre", label: "術前" },
  { value: "intra", label: "術中" },
  { value: "post", label: "術後" },
];

export default async function TermsAdminPage() {
  const supabase = supabaseServer();
  const { data: terms } = await supabase.from("term_library").select("*").order("stage").order("sort_order");

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-heading text-xl font-medium text-brand-900">醫學術語庫</h1>
      <p className="text-sm text-ink/50">依術前/術中/術後分類，記錄時可複選；示意圖用網址連結（demo 簡化，正式版可改為上傳）。</p>

      <form action={addTermAction} className="space-y-2 rounded-lg border border-brand-100 bg-paper-raised p-4">
        <div className="flex gap-2">
          <select name="stage" className="rounded-md border border-brand-200 px-2 py-1.5 text-sm">
            {STAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input name="term" placeholder="術語文字" required className="flex-1 rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        </div>
        <input name="image_url" placeholder="示意圖網址（選填）" className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        <SubmitButton pendingText="新增中…">新增</SubmitButton>
      </form>

      {(["pre", "intra", "post"] as const).map((stage) => (
        <div key={stage}>
          <h2 className="mb-1 text-sm font-semibold text-brand-900">{STAGE_LABEL[stage]}</h2>
          <ul className="divide-y divide-brand-50 rounded-lg border border-brand-100 bg-paper-raised">
            {(terms ?? [])
              .filter((t) => t.stage === stage)
              .map((t) => (
                <li key={t.id}>
                  <EditableListItem
                    hidden={{ id: t.id }}
                    fields={[
                      { name: "stage", label: "階段", defaultValue: t.stage, type: "select", options: STAGE_OPTIONS },
                      { name: "term", label: "術語文字", defaultValue: t.term, className: "flex-1" },
                      { name: "image_url", label: "示意圖網址", defaultValue: t.image_url ?? "", className: "w-56" },
                    ]}
                    updateAction={updateTermAction}
                    deleteAction={deleteTermAction}
                    trailing={
                      <form action={toggleTermActiveAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="active" value={String(t.active)} />
                        <SubmitButton variant="ghost" size="sm" className="!px-0 !py-0 text-xs text-ink/40 underline hover:!bg-transparent" pendingText="處理中…">
                          {t.active ? "停用" : "啟用"}
                        </SubmitButton>
                      </form>
                    }
                  >
                    <span className={t.active ? "" : "text-ink/30 line-through"}>
                      {t.term} {t.image_url && <span className="text-xs text-ink/40">（有示意圖）</span>}
                    </span>
                  </EditableListItem>
                </li>
              ))}
            {(terms ?? []).filter((t) => t.stage === stage).length === 0 && (
              <li className="px-4 py-2 text-sm text-ink/40">尚無術語</li>
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}
