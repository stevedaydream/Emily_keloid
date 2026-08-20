import { supabaseServer } from "@/lib/supabase";
import {
  addOperatorAction,
  toggleOperatorActiveAction,
  updateOperatorAction,
  deleteOperatorAction,
  toggleDevMobileMappingAction,
  toggleNavCompactAction,
} from "./actions";
import { LANDING_OPTIONS, LANDING_LABEL, toLandingMode } from "@/lib/operator";
import SubmitButton from "@/components/ui/SubmitButton";
import EditableListItem from "@/components/admin/EditableListItem";

export default async function OperatorsAdminPage() {
  const supabase = supabaseServer();
  const { data: operators } = await supabase.from("operators").select("*").order("sort_order").order("name");

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-heading text-xl font-medium text-brand-900">操作者清單</h1>
      <p className="text-sm text-ink/50">
        共用帳號登入後，選擇「目前操作者」用於稽核紀錄。
        「登入後落點」決定這位操作者選完身分要進哪一頁；「精簡導覽列」把非核心功能收進「更多」，
        給只需要收案建檔、門診登打、遞平板的診間護理師用。
        <b>兩者都只是動線，不是權限</b>：任何人仍可自行前往任何頁面。
      </p>

      <form action={addOperatorAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-brand-100 bg-paper-raised p-4">
        <div>
          <label className="block text-xs font-medium text-ink/60">姓名</label>
          <input name="name" required className="mt-1 w-40 rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60">角色（選填）</label>
          <input name="role" className="mt-1 w-40 rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60">排序</label>
          <input name="sort_order" type="number" defaultValue={100} className="mt-1 w-20 rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60">登入後落點</label>
          <select name="landing_mode" defaultValue="dashboard" className="mt-1 w-36 rounded-md border border-brand-200 px-2 py-1.5 text-sm">
            {LANDING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs text-ink/60">
          <input type="checkbox" name="nav_compact" className="rounded border-brand-300" />
          精簡導覽列
        </label>
        <SubmitButton pendingText="新增中…">新增</SubmitButton>
      </form>

      <ul className="divide-y divide-brand-50 rounded-lg border border-brand-100 bg-paper-raised">
        {(operators ?? []).map((o) => (
          <li key={o.id}>
            <EditableListItem
              hidden={{ id: o.id }}
              fields={[
                { name: "name", label: "姓名", defaultValue: o.name, className: "w-40" },
                { name: "role", label: "角色", defaultValue: o.role ?? "", className: "w-40" },
                { name: "sort_order", label: "排序", defaultValue: String(o.sort_order ?? 100), className: "w-20" },
                {
                  name: "landing_mode",
                  label: "登入後落點",
                  defaultValue: toLandingMode(o.landing_mode),
                  type: "select",
                  options: LANDING_OPTIONS,
                },
              ]}
              updateAction={updateOperatorAction}
              deleteAction={deleteOperatorAction}
              trailing={
                <span className="flex items-center gap-3">
                  <form action={toggleNavCompactAction}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="nav_compact" value={String(o.nav_compact)} />
                    <SubmitButton
                      variant="ghost"
                      size="sm"
                      className="!px-0 !py-0 whitespace-nowrap text-xs text-ink/40 underline hover:!bg-transparent"
                      pendingText="處理中…"
                    >
                      {o.nav_compact ? "取消精簡導覽" : "設為精簡導覽"}
                    </SubmitButton>
                  </form>
                  <form action={toggleDevMobileMappingAction}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="dev_mobile_mapping" value={String(o.dev_mobile_mapping)} />
                    <SubmitButton
                      variant="ghost"
                      size="sm"
                      className="!px-0 !py-0 whitespace-nowrap text-xs text-ink/40 underline hover:!bg-transparent"
                      pendingText="處理中…"
                    >
                      {o.dev_mobile_mapping ? "關閉工程模式" : "開啟工程模式"}
                    </SubmitButton>
                  </form>
                  <form action={toggleOperatorActiveAction}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="active" value={String(o.active)} />
                    <SubmitButton variant="ghost" size="sm" className="!px-0 !py-0 text-xs text-ink/40 underline hover:!bg-transparent" pendingText="處理中…">
                      {o.active ? "停用" : "啟用"}
                    </SubmitButton>
                  </form>
                </span>
              }
            >
              <span className={o.active ? "" : "text-ink/30 line-through"}>
                {o.name} {o.role && <span className="text-xs text-ink/40">（{o.role}）</span>}
                <span className="ml-2 whitespace-nowrap rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-800">
                  → {LANDING_LABEL[toLandingMode(o.landing_mode)]}
                </span>
                {o.nav_compact && (
                  <span
                    className="ml-2 whitespace-nowrap rounded bg-accent-100 px-1.5 py-0.5 text-xs text-accent-800"
                    title="導覽列只留「+ 收案・今日門診・個案列表」，其餘收進「更多」"
                  >
                    精簡導覽
                  </span>
                )}
                {o.dev_mobile_mapping && (
                  <span
                    className="ml-2 whitespace-nowrap rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-800"
                    title="可在手機/平板上以唯讀方式掛載病歷號對照表（僅此工作階段、不落地）。正式收案前請關閉。"
                  >
                    工程模式
                  </span>
                )}
              </span>
            </EditableListItem>
          </li>
        ))}
        {(operators ?? []).length === 0 && <li className="px-4 py-2 text-sm text-ink/40">尚無操作者</li>}
      </ul>
    </div>
  );
}
