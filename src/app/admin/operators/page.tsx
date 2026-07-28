import { supabaseServer } from "@/lib/supabase";
import {
  addOperatorAction,
  toggleOperatorActiveAction,
  updateOperatorAction,
  deleteOperatorAction,
  toggleDevMobileMappingAction,
} from "./actions";
import SubmitButton from "@/components/ui/SubmitButton";
import EditableListItem from "@/components/admin/EditableListItem";

const LANDING_OPTIONS = [
  { value: "full", label: "完整後台" },
  { value: "intake", label: "精簡收案頁" },
];
const LANDING_LABEL: Record<string, string> = { full: "完整後台", intake: "精簡收案頁" };

export default async function OperatorsAdminPage() {
  const supabase = supabaseServer();
  const { data: operators } = await supabase.from("operators").select("*").order("name");

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-heading text-xl font-medium text-brand-900">操作者清單</h1>
      <p className="text-sm text-ink/50">
        共用帳號登入後，選擇「目前操作者」用於稽核紀錄。
        「登入後落點」決定這位操作者選完身分要進哪一頁——連續收案的醫師選「精簡收案頁」，
        其餘選「完整後台」。<b>這只是預設落點，不是權限</b>：任何人仍可自行前往任何頁面。
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
          <label className="block text-xs font-medium text-ink/60">登入後落點</label>
          <select name="landing_mode" defaultValue="full" className="mt-1 w-36 rounded-md border border-brand-200 px-2 py-1.5 text-sm">
            {LANDING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
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
                {
                  name: "landing_mode",
                  label: "登入後落點",
                  defaultValue: o.landing_mode ?? "full",
                  type: "select",
                  options: LANDING_OPTIONS,
                },
              ]}
              updateAction={updateOperatorAction}
              deleteAction={deleteOperatorAction}
              trailing={
                <span className="flex items-center gap-3">
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
                <span
                  className={`ml-2 whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${
                    o.landing_mode === "intake" ? "bg-accent-100 text-accent-800" : "bg-brand-50 text-brand-800"
                  }`}
                >
                  {LANDING_LABEL[o.landing_mode ?? "full"]}
                </span>
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
