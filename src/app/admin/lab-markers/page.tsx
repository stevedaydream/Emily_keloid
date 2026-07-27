import { supabaseServer } from "@/lib/supabase";
import { addLabMarkerAction, toggleLabMarkerActiveAction, updateLabMarkerAction, deleteLabMarkerAction } from "./actions";
import SubmitButton from "@/components/ui/SubmitButton";
import EditableListItem from "@/components/admin/EditableListItem";

export default async function LabMarkersAdminPage() {
  const supabase = supabaseServer();
  const { data: markers } = await supabase.from("lab_marker_definitions").select("*").order("sort_order");

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="font-heading text-xl font-medium text-brand-900">Lab 生物標記清單</h1>
        <p className="mt-1 text-sm text-ink/50">
          個案頁面「Lab 生物標記數據」區塊的標記選項來自這裡維護的清單，可自行新增其他標記。
        </p>
      </div>

      <form action={addLabMarkerAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-brand-100 bg-paper-raised p-3">
        <div>
          <label className="block text-xs font-medium text-ink/60">代碼（英數，唯一）</label>
          <input name="marker_key" placeholder="例如 il10" required className="mt-1 rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60">顯示名稱</label>
          <input name="display_name" placeholder="例如 IL-10" required className="mt-1 rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60">單位</label>
          <input name="unit" placeholder="例如 pg/mL" className="mt-1 rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        </div>
        <SubmitButton pendingText="新增中…">新增</SubmitButton>
      </form>

      <ul className="divide-y divide-brand-50 rounded-lg border border-brand-100 bg-paper-raised">
        {(markers ?? []).map((m) => (
          <li key={m.id}>
            <EditableListItem
              hidden={{ id: m.id }}
              fields={[
                { name: "display_name", label: "顯示名稱", defaultValue: m.display_name, className: "w-40" },
                { name: "unit", label: "單位", defaultValue: m.unit ?? "", className: "w-32" },
              ]}
              updateAction={updateLabMarkerAction}
              deleteAction={deleteLabMarkerAction}
              trailing={
                <form action={toggleLabMarkerActiveAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="active" value={String(m.active)} />
                  <SubmitButton variant="ghost" size="sm" className="!px-0 !py-0 text-xs text-ink/40 underline hover:!bg-transparent" pendingText="處理中…">
                    {m.active ? "停用" : "啟用"}
                  </SubmitButton>
                </form>
              }
            >
              <span className={m.active ? "" : "text-ink/30 line-through"}>
                {m.display_name}
                {m.unit && <span className="ml-2 text-xs text-ink/40">（{m.unit}）</span>}
              </span>
            </EditableListItem>
          </li>
        ))}
        {(markers ?? []).length === 0 && <li className="px-4 py-2 text-sm text-ink/40">尚無標記</li>}
      </ul>
    </div>
  );
}
