import { supabaseServer } from "@/lib/supabase";
import { addDoctorAction, toggleDoctorActiveAction, updateDoctorAction, deleteDoctorAction } from "./actions";
import SubmitButton from "@/components/ui/SubmitButton";
import EditableListItem from "@/components/admin/EditableListItem";

export default async function DoctorsAdminPage() {
  const supabase = supabaseServer();
  const { data: doctors } = await supabase.from("doctors").select("*").order("code");

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-heading text-xl font-medium text-brand-900">醫師代碼清單</h1>
      <p className="text-sm text-ink/50">用於研究編號規則 [醫師代碼]-[年份]-[流水序號]。</p>

      <form action={addDoctorAction} className="flex items-end gap-2 rounded-lg border border-brand-100 bg-paper-raised p-4">
        <div>
          <label className="block text-xs font-medium text-ink/60">代碼</label>
          <input name="code" placeholder="例：CHN" required className="mt-1 w-28 rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60">醫師姓名</label>
          <input name="name" required className="mt-1 w-48 rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        </div>
        <SubmitButton pendingText="新增中…">新增</SubmitButton>
      </form>

      <ul className="divide-y divide-brand-50 rounded-lg border border-brand-100 bg-paper-raised">
        {(doctors ?? []).map((d) => (
          <li key={d.id}>
            <EditableListItem
              hidden={{ id: d.id }}
              fields={[
                { name: "code", label: "代碼", defaultValue: d.code, className: "w-28" },
                { name: "name", label: "醫師姓名", defaultValue: d.name, className: "w-48" },
              ]}
              updateAction={updateDoctorAction}
              deleteAction={deleteDoctorAction}
              trailing={
                <form action={toggleDoctorActiveAction}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="active" value={String(d.active)} />
                  <SubmitButton variant="ghost" size="sm" className="!px-0 !py-0 text-xs text-ink/40 underline hover:!bg-transparent" pendingText="處理中…">
                    {d.active ? "停用" : "啟用"}
                  </SubmitButton>
                </form>
              }
            >
              <span className={d.active ? "" : "text-ink/30 line-through"}>
                <b>{d.code}</b> — {d.name}
              </span>
            </EditableListItem>
          </li>
        ))}
        {(doctors ?? []).length === 0 && <li className="px-4 py-2 text-sm text-ink/40">尚無醫師代碼</li>}
      </ul>
    </div>
  );
}
