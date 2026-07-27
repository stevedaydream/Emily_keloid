import { supabaseServer } from "@/lib/supabase";
import { addIcdCodeAction, toggleIcdActiveAction, updateIcdCodeAction, deleteIcdCodeAction } from "./actions";
import SubmitButton from "@/components/ui/SubmitButton";
import EditableListItem from "@/components/admin/EditableListItem";

const SYSTEM_OPTIONS = [
  { value: "ICD9", label: "ICD-9" },
  { value: "ICD10", label: "ICD-10" },
];

export default async function IcdAdminPage() {
  const supabase = supabaseServer();
  const { data: codes } = await supabase.from("icd_codes").select("*").order("code");

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-heading text-xl font-medium text-brand-900">ICD-9/10 常用碼清單</h1>
      <p className="text-sm text-ink/50">僅收錄蟹足腫相關的精簡常用碼，非完整 ICD 碼表。</p>

      <form action={addIcdCodeAction} className="space-y-2 rounded-lg border border-brand-100 bg-paper-raised p-4">
        <div className="flex gap-2">
          <select name="system" className="rounded-md border border-brand-200 px-2 py-1.5 text-sm">
            {SYSTEM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input name="code" placeholder="代碼，例：L91.0" required className="w-32 rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        </div>
        <input
          name="description_full"
          placeholder="完整診斷全文說明"
          required
          className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
        />
        <SubmitButton pendingText="新增中…">新增</SubmitButton>
      </form>

      <ul className="divide-y divide-brand-50 rounded-lg border border-brand-100 bg-paper-raised">
        {(codes ?? []).map((c) => (
          <li key={c.id}>
            <EditableListItem
              hidden={{ id: c.id }}
              fields={[
                { name: "system", label: "系統", defaultValue: c.system, type: "select", options: SYSTEM_OPTIONS },
                { name: "code", label: "代碼", defaultValue: c.code, className: "w-32" },
                { name: "description_full", label: "完整診斷全文", defaultValue: c.description_full, className: "w-full" },
              ]}
              updateAction={updateIcdCodeAction}
              deleteAction={deleteIcdCodeAction}
              trailing={
                <form action={toggleIcdActiveAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="active" value={String(c.active)} />
                  <SubmitButton variant="ghost" size="sm" className="!px-0 !py-0 text-xs text-ink/40 underline hover:!bg-transparent" pendingText="處理中…">
                    {c.active ? "停用" : "啟用"}
                  </SubmitButton>
                </form>
              }
            >
              <span className={c.active ? "" : "text-ink/30 line-through"}>
                [{c.system}] <b>{c.code}</b> — {c.description_full}
              </span>
            </EditableListItem>
          </li>
        ))}
        {(codes ?? []).length === 0 && <li className="px-4 py-2 text-sm text-ink/40">尚無診斷碼</li>}
      </ul>
    </div>
  );
}
