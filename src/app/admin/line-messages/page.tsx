import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import {
  LINE_TEMPLATES,
  LINE_TEMPLATE_GROUPS,
  LINE_TEMPLATE_BY_KEY,
  makeLineTemplates,
} from "@/lib/lineTemplates";
import TemplateEditor from "./TemplateEditor";

// LINE bot 對外講的每一句話都在這一頁。衛教「內容」本身不在這裡（那在 /admin/health-kb），
// 這裡管的是提醒措辭、綁定回覆、選單提示語、AI 回應語氣這些固定用語與行為參數。

export default async function LineMessagesAdminPage() {
  const supabase = supabaseServer();
  const { data } = await supabase
    .from("line_message_templates")
    .select("key, content, updated_at, updated_by");

  const rows = new Map((data ?? []).map((r) => [r.key as string, r]));
  // 登錄檔已移除的殘留 key 不要算進「已修改」統計，否則數字會對不上畫面。
  const overrides = Object.fromEntries(
    (data ?? [])
      .filter((r) => LINE_TEMPLATE_BY_KEY.has(r.key))
      .map((r) => [r.key as string, (r.content ?? "") as string])
  );
  const t = makeLineTemplates(overrides);
  const changedCount = Object.keys(overrides).length;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-xl font-medium text-brand-900">LINE 機器人回覆設定</h1>
        <p className="mt-1 text-sm text-ink/50">
          病人在 LINE 收到的所有固定用語都在這裡改：回診／放療提醒的措辭、加好友與綁定的回覆、
          衛教選單的提示語，以及自由提問時的 AI 回應語氣。
          衛教問答的<b>內容</b>不在這頁，請到{" "}
          <Link href="/admin/health-kb" className="text-brand-700 underline">
            LINE 衛教機器人內容
          </Link>{" "}
          維護。
        </p>
      </div>

      <div className="rounded-lg border border-brand-100 bg-brand-50/40 p-3 text-xs leading-relaxed text-ink/60">
        <b className="text-ink/70">怎麼運作</b>
        <p className="mt-1">
          每一則都有系統預設值，沒改過就用預設；改過的會標「已修改」，按「恢復預設內容」就能還原。
          存檔後<b>立即生效</b>，不需要重新部署 GAS——GAS 只負責把平台回傳的文字原封不動轉給 LINE。
          目前有 <b>{changedCount}</b> 則被改過。
        </p>
        <p className="mt-1 text-ink/45">
          帶 <code className="font-data text-brand-700">{"{{變數}}"}</code> 的欄位會在推播時代換成實際內容，
          編輯框下方的預覽已用範例值套好。變數名稱打錯不會報錯，會原樣出現在病人的訊息裡，所以請對照預覽確認。
        </p>
      </div>

      {LINE_TEMPLATE_GROUPS.map((group) => {
        const defs = LINE_TEMPLATES.filter((d) => d.group === group.key);
        return (
          <section key={group.key} className="space-y-2">
            <div>
              <h2 className="font-heading text-base font-medium text-brand-800">{group.label}</h2>
              <p className="text-xs text-ink/50">{group.description}</p>
            </div>
            <ul className="space-y-3">
              {defs.map((def) => {
                const row = rows.get(def.key);
                return (
                  <TemplateEditor
                    key={def.key}
                    def={def}
                    value={t.raw(def.key)}
                    overridden={t.isOverridden(def.key)}
                    updatedAt={row?.updated_at ?? null}
                    updatedBy={row?.updated_by ?? null}
                  />
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
