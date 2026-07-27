import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { addKbEntryAction, toggleKbActiveAction, updateKbEntryAction, deleteKbEntryAction } from "./actions";
import SubmitButton from "@/components/ui/SubmitButton";
import EditableListItem from "@/components/admin/EditableListItem";

export default async function HealthKbAdminPage() {
  const supabase = supabaseServer();
  const { data: entries } = await supabase.from("health_education_kb").select("*").order("sort_order");

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-medium text-brand-900">衛教資料庫</h1>
        <Link href="/kb-chat" className="text-sm text-brand-700 underline">
          試用衛教機器人 →
        </Link>
      </div>
      <p className="text-sm text-ink/50">
        Gemini 衛教機器人只會依據下方內容回答，資料庫沒涵蓋的問題會請病人洽詢診間，不會自行發揮通用醫學知識。
      </p>

      <form action={addKbEntryAction} className="space-y-2 rounded-lg border border-brand-100 bg-paper-raised p-4">
        <input name="topic" placeholder="主題（例：傷口會癢怎麼辦）" required className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        <textarea name="content" rows={3} placeholder="衛教內容" required className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        <SubmitButton pendingText="新增中…">新增</SubmitButton>
      </form>

      <ul className="space-y-2">
        {(entries ?? []).map((e) => (
          <li key={e.id} className="rounded-lg border border-brand-100 bg-paper-raised">
            <EditableListItem
              hidden={{ id: e.id }}
              fields={[
                { name: "topic", label: "主題", defaultValue: e.topic, className: "w-full" },
                { name: "content", label: "衛教內容", defaultValue: e.content, type: "textarea", className: "w-full" },
              ]}
              updateAction={updateKbEntryAction}
              deleteAction={deleteKbEntryAction}
              trailing={
                <form action={toggleKbActiveAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="active" value={String(e.active)} />
                  <SubmitButton variant="ghost" size="sm" className="!px-0 !py-0 text-xs text-ink/40 underline hover:!bg-transparent" pendingText="處理中…">
                    {e.active ? "停用" : "啟用"}
                  </SubmitButton>
                </form>
              }
            >
              <div className={e.active ? "" : "text-ink/30 line-through"}>
                <b>{e.topic}</b>
                <p className="mt-1 text-ink/60">{e.content}</p>
              </div>
            </EditableListItem>
          </li>
        ))}
        {(entries ?? []).length === 0 && <li className="text-sm text-ink/40">尚無衛教內容</li>}
      </ul>
    </div>
  );
}
