import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { addKbEntryAction, toggleKbActiveAction, updateKbEntryAction, deleteKbEntryAction } from "./actions";
import SubmitButton from "@/components/ui/SubmitButton";
import EditableListItem from "@/components/admin/EditableListItem";
import {
  KB_QUICK_REPLY_MAX,
  KB_TOPIC_MAX,
  kbCategories,
  kbCategoryOf,
  kbMenuQuickReplies,
} from "@/lib/line";
import { loadLineTemplates, type LineTemplates } from "@/lib/lineTemplates";

type KbEntry = {
  id: string;
  topic: string;
  content: string;
  category: string | null;
  pdf_url: string | null;
  video_url: string | null;
  active: boolean;
  sort_order: number;
};

/**
 * 哪幾則雖然已啟用、但排不進 LINE 的按鈕列（一則訊息最多 13 顆）。
 * 後台要看得出來，否則「我明明啟用了為什麼病人沒看到按鈕」永遠查不到原因。
 */
function topicsHiddenFromMenu(entries: KbEntry[], grouped: boolean, t: LineTemplates): Set<string> {
  const hidden = new Set<string>();
  if (!grouped) {
    entries.slice(KB_QUICK_REPLY_MAX).forEach((e) => hidden.add(e.id));
    return hidden;
  }
  const seenPerCategory = new Map<string, number>();
  for (const e of entries) {
    const c = kbCategoryOf(e, t);
    const n = (seenPerCategory.get(c) ?? 0) + 1;
    seenPerCategory.set(c, n);
    if (n > KB_TOPIC_MAX) hidden.add(e.id);
  }
  return hidden;
}

export default async function HealthKbAdminPage() {
  const supabase = supabaseServer();
  const { data } = await supabase
    .from("health_education_kb")
    .select("*")
    .order("sort_order")
    // 跟 /api/line/message 用同一組排序，後台看到的順序才等於病人看到的按鈕順序
    .order("created_at");
  const entries = (data ?? []) as KbEntry[];

  // 未分類的名稱、關鍵字等是後台可改的（/admin/line-messages），這頁的說明要跟著顯示實際值。
  const t = await loadLineTemplates(supabase);
  const activeEntries = entries.filter((e) => e.active);
  const pendingEntries = entries.filter((e) => !e.active);
  const { grouped } = kbMenuQuickReplies(activeEntries, t);
  const hidden = topicsHiddenFromMenu(activeEntries, grouped, t);
  const categories = kbCategories(activeEntries, t);

  const renderItem = (e: KbEntry) => (
    <li key={e.id} className="rounded-lg border border-brand-100 bg-paper-raised">
      <EditableListItem
        hidden={{ id: e.id }}
        fields={[
          { name: "topic", label: "主題", defaultValue: e.topic, className: "w-full", fullWidth: true },
          { name: "category", label: "分類（選填）", defaultValue: e.category ?? "", className: "w-44" },
          { name: "sort_order", label: "排序（小的排前面）", defaultValue: String(e.sort_order), className: "w-28" },
          { name: "content", label: "衛教內容", defaultValue: e.content, type: "textarea", className: "w-full", fullWidth: true },
          { name: "pdf_url", label: "醫院衛教單張連結（選填）", defaultValue: e.pdf_url ?? "", className: "w-full", fullWidth: true },
          { name: "video_url", label: "衛教影片連結（選填）", defaultValue: e.video_url ?? "", className: "w-full", fullWidth: true },
        ]}
        updateAction={updateKbEntryAction}
        deleteAction={deleteKbEntryAction}
        trailing={
          <form action={toggleKbActiveAction}>
            <input type="hidden" name="id" value={e.id} />
            <input type="hidden" name="active" value={String(e.active)} />
            <SubmitButton
              variant={e.active ? "ghost" : "primary"}
              size="sm"
              className={
                e.active
                  ? "!px-0 !py-0 text-xs text-ink/40 underline hover:!bg-transparent"
                  : "text-xs"
              }
              pendingText="處理中…"
            >
              {e.active ? "停用" : "啟用"}
            </SubmitButton>
          </form>
        }
      >
        <div className={e.active ? "" : "text-ink/50"}>
          <span className="mr-1.5 font-data text-xs text-ink/30">#{e.sort_order}</span>
          {e.category && (
            <span className="mr-1.5 rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">{e.category}</span>
          )}
          <b>{e.topic}</b>
          {hidden.has(e.id) && (
            <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
              超出按鈕上限，LINE 不會顯示
            </span>
          )}
          <p className="mt-1 text-ink/60">{e.content}</p>
          {(e.pdf_url || e.video_url) && (
            <p className="mt-1 flex flex-wrap gap-3 text-xs">
              {e.pdf_url && (
                <a href={e.pdf_url} target="_blank" rel="noreferrer" className="text-brand-700 underline">
                  📄 衛教單張
                </a>
              )}
              {e.video_url && (
                <a href={e.video_url} target="_blank" rel="noreferrer" className="text-brand-700 underline">
                  🎬 衛教影片
                </a>
              )}
            </p>
          )}
        </div>
      </EditableListItem>
    </li>
  );

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
        <br />
        新增的內容一律先進「待啟用」，確認無誤後按「啟用」才會出現在病人的 LINE 選單。
      </p>

      <div className="rounded-lg border border-brand-100 bg-brand-50/40 p-3 text-xs text-ink/60">
        <b className="text-ink/70">LINE 選單目前的樣子</b>
        <p className="mt-1">
          已啟用 {activeEntries.length} 則
          {grouped ? (
            <>
              ，超過一則訊息能放的 {KB_QUICK_REPLY_MAX} 顆按鈕，因此病人會先看到{" "}
              <b>{categories.length} 個分類</b>（{categories.join("、")}），點分類後才看到該分類的主題。
              每個分類最多顯示 {KB_TOPIC_MAX} 則。
            </>
          ) : (
            <>
              ，會直接列成主題按鈕（最多 {KB_QUICK_REPLY_MAX} 顆）。內容超過 {KB_QUICK_REPLY_MAX} 則且分類有兩個以上時，
              會自動改成「先選分類、再選主題」兩層。
            </>
          )}
        </p>
        {hidden.size > 0 && (
          <p className="mt-1 text-amber-700">
            有 {hidden.size} 則排在上限之外、病人點不到（下方以標籤標示）。請調小它們的排序數字，或再細分分類。
          </p>
        )}
        <p className="mt-1">分類留空的會被歸到「{t.text("menu.uncategorized")}」，不會從選單消失。</p>
      </div>

      <form action={addKbEntryAction} className="space-y-2 rounded-lg border border-brand-100 bg-paper-raised p-4">
        <div className="flex gap-2">
          <input name="topic" placeholder="主題（例：傷口會癢怎麼辦）" required className="flex-1 rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
          <input name="category" placeholder="分類（選填，例：傷口照護）" className="w-44 rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        </div>
        <textarea name="content" rows={3} placeholder="衛教內容" required className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        <input name="pdf_url" placeholder="醫院衛教單張連結（選填，PDF 網址）" className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        <input name="video_url" placeholder="衛教影片連結（選填）" className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        <div className="flex items-center gap-2">
          <input name="sort_order" placeholder="排序（選填，預設排最後）" className="w-48 rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
          <SubmitButton pendingText="新增中…">新增（待啟用）</SubmitButton>
        </div>
      </form>

      {pendingEntries.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-heading text-sm font-medium text-amber-800">
            待啟用（{pendingEntries.length}）— 尚未出現在病人的 LINE 選單
          </h2>
          <ul className="space-y-2">{pendingEntries.map(renderItem)}</ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-heading text-sm font-medium text-brand-800">已啟用（{activeEntries.length}）</h2>
        <ul className="space-y-2">
          {activeEntries.map(renderItem)}
          {activeEntries.length === 0 && <li className="text-sm text-ink/40">尚無已啟用的衛教內容</li>}
        </ul>
      </section>
    </div>
  );
}
