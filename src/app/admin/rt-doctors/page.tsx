import { supabaseServer } from "@/lib/supabase";
import SubmitButton from "@/components/ui/SubmitButton";
import EditableListItem from "@/components/admin/EditableListItem";
import {
  addRtDoctorAction,
  updateRtDoctorAction,
  toggleRtDoctorActiveAction,
  deleteRtDoctorAction,
} from "./actions";

export default async function RtDoctorsAdminPage() {
  const supabase = supabaseServer();
  const { data: doctors } = await supabase
    .from("radiotherapy_doctors")
    .select("*")
    .order("sort_order")
    .order("name");

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-heading text-xl font-medium text-brand-900">放射科醫師清單</h1>
      <p className="text-sm text-ink/50">
        登打放射治療、以及逐次放療待辦標記完成時可選的醫師。
        「匯出代碼」對應收案格式 <code className="rounded bg-brand-50 px-1 text-brand-700">Operation</code> 表的{" "}
        <code className="rounded bg-brand-50 px-1 text-brand-700">RT_Doctor</code> 欄（1–7）；留空則該筆匯出時不帶代碼。
      </p>
      <p className="text-xs text-ink/40">
        這份清單與「醫師代碼清單」是不同的東西——那份的代碼會編進研究編號（例 YEN-2026-001），這份只用於放療紀錄。
      </p>

      <form action={addRtDoctorAction} className="flex items-end gap-2 rounded-lg border border-brand-100 bg-paper-raised p-4">
        <div>
          <label className="block text-xs font-medium text-ink/60">醫師姓名</label>
          <input name="name" required className="mt-1 w-48 rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60">匯出代碼</label>
          <input
            name="export_code"
            type="number"
            min={1}
            placeholder="例：8"
            className="mt-1 w-24 rounded-md border border-brand-200 px-2 py-1.5 text-sm"
          />
        </div>
        <SubmitButton pendingText="新增中…">新增</SubmitButton>
      </form>

      <ul className="divide-y divide-brand-50 rounded-lg border border-brand-100 bg-paper-raised">
        {(doctors ?? []).map((d) => (
          <li key={d.id} className={d.active ? "" : "opacity-50"}>
            <EditableListItem
              hidden={{ id: d.id }}
              fields={[
                { name: "name", label: "醫師姓名", defaultValue: d.name, className: "w-48" },
                { name: "export_code", label: "匯出代碼", defaultValue: d.export_code ?? "", className: "w-24" },
              ]}
              updateAction={updateRtDoctorAction}
              deleteAction={deleteRtDoctorAction}
              trailing={
                <form action={toggleRtDoctorActiveAction}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="active" value={String(d.active)} />
                  <SubmitButton
                    variant="ghost"
                    size="sm"
                    className="!px-0 !py-0 text-xs text-ink/40 underline hover:!bg-transparent"
                    pendingText="處理中…"
                  >
                    {d.active ? "停用" : "啟用"}
                  </SubmitButton>
                </form>
              }
            >
              <span className={d.active ? "" : "text-ink/30 line-through"}>
                <b>{d.name}</b>
                {d.export_code != null && <span className="ml-2 text-xs text-ink/40">匯出代碼 {d.export_code}</span>}
              </span>
            </EditableListItem>
          </li>
        ))}
        {(doctors ?? []).length === 0 && <li className="p-4 text-sm text-ink/40">尚未建立任何放射科醫師</li>}
      </ul>
    </div>
  );
}
