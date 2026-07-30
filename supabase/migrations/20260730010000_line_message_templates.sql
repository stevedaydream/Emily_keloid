-- LINE bot 文案／行為參數的後台覆寫表（2026-07-30）。
--
-- 刻意**不 seed 預設值**：預設文案的唯一來源是 src/lib/lineTemplates.ts 的登錄檔，
-- 這張表只存「後台真的改過的那幾則」。好處是
--   ① 程式改預設文案時不會跟資料庫的 seed 值打架
--   ② 「恢復預設」＝ delete 那一列，不需要記得原文
--   ③ 這張表整個讀不到時，程式會回退登錄檔的預設值，bot 照樣運作
--
-- key 對應登錄檔的 LineTemplateDef.key，不設外鍵（另一邊在程式碼裡）。
-- 登錄檔移除某個 key 之後，殘留列會被程式忽略，不必特地清。

create table if not exists public.line_message_templates (
  key text primary key,
  content text not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table public.line_message_templates is
  'LINE bot 文案／行為參數的後台覆寫值。只存被改過的項目，預設值在 src/lib/lineTemplates.ts。';
comment on column public.line_message_templates.key is
  '對應 src/lib/lineTemplates.ts 的 LineTemplateDef.key。';
comment on column public.line_message_templates.content is
  '覆寫後的內容。空字串是有效值（代表刻意清空該行），刪除該列才是恢復預設。';

alter table public.line_message_templates enable row level security;

-- Demo 階段的取捨同其他資料表：存取控制在應用層（見 project.md「安全性備忘」）。
drop policy if exists "anon full access" on public.line_message_templates;
create policy "anon full access" on public.line_message_templates
  for all to anon using (true) with check (true);

grant all on public.line_message_templates to anon, authenticated;
