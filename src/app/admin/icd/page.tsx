import { supabaseServer } from "@/lib/supabase";
import { addIcdCodeAction, toggleIcdActiveAction, updateIcdCodeAction, deleteIcdCodeAction } from "./actions";
import SubmitButton from "@/components/ui/SubmitButton";
import EditableListItem from "@/components/admin/EditableListItem";

const SYSTEM_OPTIONS = [
  { value: "ICD9", label: "ICD-9" },
  { value: "ICD10", label: "ICD-10" },
];

type IcdCode = {
  id: string;
  code: string;
  system: string;
  description_full: string;
  mapping_key: string | null;
  active: boolean;
};

export default async function IcdAdminPage() {
  const supabase = supabaseServer();
  const { data } = await supabase.from("icd_codes").select("*").order("mapping_key").order("system").order("code");
  const codes = (data ?? []) as IcdCode[];

  // 共用同一個 mapping_key 的碼＝一組 ICD-9 ↔ ICD-10 對照；沒有 key 的列在「未對照」區。
  const pairs = new Map<string, IcdCode[]>();
  const unpaired: IcdCode[] = [];
  for (const c of codes) {
    if (!c.mapping_key) {
      unpaired.push(c);
      continue;
    }
    pairs.set(c.mapping_key, [...(pairs.get(c.mapping_key) ?? []), c]);
  }

  const editableFields = (c: IcdCode) => [
    { name: "system", label: "系統", defaultValue: c.system, type: "select" as const, options: SYSTEM_OPTIONS },
    { name: "code", label: "代碼", defaultValue: c.code, className: "w-32" },
    { name: "description_full", label: "完整診斷全文", defaultValue: c.description_full, className: "w-full" },
    { name: "mapping_key", label: "對照鍵", defaultValue: c.mapping_key ?? "", className: "w-40" },
  ];

  const trailingToggle = (c: IcdCode) => (
    <form action={toggleIcdActiveAction}>
      <input type="hidden" name="id" value={c.id} />
      <input type="hidden" name="active" value={String(c.active)} />
      <SubmitButton variant="ghost" size="sm" className="!px-0 !py-0 text-xs text-ink/40 underline hover:!bg-transparent" pendingText="處理中…">
        {c.active ? "停用" : "啟用"}
      </SubmitButton>
    </form>
  );

  const codeRow = (c: IcdCode, tone: "pair" | "plain") => (
    <EditableListItem
      hidden={{ id: c.id }}
      fields={editableFields(c)}
      updateAction={updateIcdCodeAction}
      deleteAction={deleteIcdCodeAction}
      trailing={trailingToggle(c)}
    >
      <span className={c.active ? "" : "text-ink/30 line-through"}>
        <span
          className={`mr-1 rounded px-1.5 py-0.5 text-[11px] ${
            tone === "pair" ? "bg-brand-50 text-brand-800" : "bg-ink/10 text-ink/50"
          }`}
        >
          {c.system === "ICD9" ? "ICD-9" : "ICD-10"}
        </span>
        <b className="font-data">{c.code}</b> — {c.description_full}
      </span>
    </EditableListItem>
  );

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="font-heading text-xl font-medium text-brand-900">ICD-9/10 常用碼清單</h1>
      <p className="text-sm text-ink/50">
        僅收錄蟹足腫相關的精簡常用碼，非完整 ICD 碼表。
        <b className="text-ink/70">填相同「對照鍵」的 ICD-9 與 ICD-10 會互相對照</b>
        ，個案頁面選任一邊都會自動顯示另一邊。對照鍵可自訂（例：<code className="font-data">acne_keloid</code>），共病參考等沒有跨系統對照的碼留空即可。
      </p>

      <form action={addIcdCodeAction} className="space-y-2 rounded-lg border border-brand-100 bg-paper-raised p-4">
        <div className="flex flex-wrap gap-2">
          <select name="system" className="rounded-md border border-brand-200 px-2 py-1.5 text-sm">
            {SYSTEM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input name="code" placeholder="代碼，例：L910" required className="w-32 rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
          <input
            name="mapping_key"
            placeholder="對照鍵（選填，例：acne_keloid）"
            list="icd-mapping-keys"
            className="w-56 rounded-md border border-brand-200 px-2 py-1.5 text-sm"
          />
          <datalist id="icd-mapping-keys">
            {[...pairs.keys()].map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </div>
        <input
          name="description_full"
          placeholder="完整診斷全文說明"
          required
          className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
        />
        <SubmitButton pendingText="新增中…">新增</SubmitButton>
      </form>

      <div>
        <h2 className="mb-1 text-sm font-semibold text-brand-900">雙向對照組</h2>
        <div className="space-y-3">
          {[...pairs.entries()].map(([key, group]) => {
            const hasIcd9 = group.some((c) => c.system === "ICD9");
            const hasIcd10 = group.some((c) => c.system === "ICD10");
            return (
              <div key={key} className="rounded-lg border border-brand-100 bg-paper-raised">
                <div className="flex flex-wrap items-center gap-2 border-b border-brand-50 px-4 py-1.5">
                  <span className="font-data text-xs text-ink/40">{key}</span>
                  {(!hasIcd9 || !hasIcd10) && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700">
                      只有單邊（{hasIcd9 ? "缺 ICD-10" : "缺 ICD-9"}），無法雙向對照
                    </span>
                  )}
                </div>
                <ul className="divide-y divide-brand-50">
                  {group.map((c) => (
                    <li key={c.id}>{codeRow(c, "pair")}</li>
                  ))}
                </ul>
              </div>
            );
          })}
          {pairs.size === 0 && <p className="text-sm text-ink/40">尚無對照組（填相同的「對照鍵」即可建立對照）</p>}
        </div>
      </div>

      <div>
        <h2 className="mb-1 text-sm font-semibold text-brand-900">未對照（單一系統碼，例如共病參考）</h2>
        <ul className="divide-y divide-brand-50 rounded-lg border border-brand-100 bg-paper-raised">
          {unpaired.map((c) => (
            <li key={c.id}>{codeRow(c, "plain")}</li>
          ))}
          {unpaired.length === 0 && <li className="px-4 py-2 text-sm text-ink/40">無</li>}
        </ul>
      </div>
    </div>
  );
}
