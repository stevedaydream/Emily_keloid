import { supabaseServer } from "@/lib/supabase";
import { addIcdPairAction, toggleIcdActiveAction, updateIcdCodeAction, deleteIcdCodeAction } from "./actions";
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
        僅收錄蟹足腫相關的精簡常用碼，非完整 ICD 碼表。新增時一次輸入一組 ICD-9 ＋ ICD-10，
        兩筆會共用同一個「對照鍵」而互為對照；個案頁面用 ICD-9 / ICD-10 開關切換系統時，會依對照鍵換算顯示。
        沒有對照的碼（例如共病參考用）只填一邊即可。
      </p>

      {/* 一次輸入一組對照：兩邊都填就自動配成對；只填一邊也可以（不強制有對照） */}
      <form action={addIcdPairAction} className="space-y-3 rounded-lg border border-brand-100 bg-paper-raised p-4">
        <p className="text-sm font-semibold text-brand-900">新增一組診斷（ICD-9 ＋ ICD-10）</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 rounded-md border border-brand-50 p-2">
            <p className="text-xs font-medium text-ink/60">ICD-9</p>
            <input name="icd9_code" placeholder="代碼，例：7014" className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
            <input
              name="icd9_description"
              placeholder="診斷全文（留空則沿用下方共用全文）"
              className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="space-y-1.5 rounded-md border border-brand-50 p-2">
            <p className="text-xs font-medium text-ink/60">ICD-10</p>
            <input name="icd10_code" placeholder="代碼，例：L910" className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
            <input
              name="icd10_description"
              placeholder="診斷全文（留空則沿用下方共用全文）"
              className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <input
          name="description_full"
          placeholder="共用診斷全文（兩邊文字相同時只填這裡即可，例：Hypertrophic scar）"
          className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            name="mapping_key"
            placeholder="對照鍵（選填，留空自動產生）"
            list="icd-mapping-keys"
            className="w-64 rounded-md border border-brand-200 px-2 py-1.5 text-sm"
          />
          <datalist id="icd-mapping-keys">
            {[...pairs.keys()].map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <SubmitButton pendingText="新增中…">新增</SubmitButton>
        </div>
        <p className="text-xs text-ink/40">
          只有其中一個系統有碼時，另一邊留空即可（不強制成對）；之後要補上對照，把新碼的「對照鍵」填成跟既有那筆一樣就會自動配對。
        </p>
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
