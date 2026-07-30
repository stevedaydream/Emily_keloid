-- LINE 衛教機器人的失敗紀錄（2026-07-30）。
--
-- 為什麼需要：Gemini 免費層額度用完時，比對階段會失敗，病人只會收到一句制式回覆，
-- 平台這邊完全沒有痕跡——沒有人會知道機器人其實已經壞了好幾天。
--
-- **刻意不存病人的問題內容**：病人在 LINE 打字時可能自己輸入姓名、病歷號、電話，
-- 存下來等於把去識別化的前提破掉（決策 #1）。只留階段與錯誤原因，足以判斷是額度、
-- 限流還是斷線；要知道「病人都在問什麼」請走衛教資料庫的內容規劃，不要靠這張表。

create table if not exists public.line_bot_error_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  -- gemini_match＝比對主題階段（失敗時病人收到 ai.error）
  -- gemini_rewrite＝改寫語氣階段（失敗時病人收到衛教原文，資訊仍正確）
  stage text not null check (stage in ('gemini_match', 'gemini_rewrite')),
  reason text not null,
  -- line＝病人在 LINE 提問；kb_chat＝後台的示範對話頁
  source text not null default 'line' check (source in ('line', 'kb_chat'))
);

comment on table public.line_bot_error_log is
  'LINE 衛教機器人呼叫 Gemini 失敗的紀錄。刻意不存病人問題內容（可能含個資）。';

create index if not exists line_bot_error_log_time_idx
  on public.line_bot_error_log (occurred_at desc);

alter table public.line_bot_error_log enable row level security;

drop policy if exists "anon full access" on public.line_bot_error_log;
create policy "anon full access" on public.line_bot_error_log
  for all to anon using (true) with check (true);

grant all on public.line_bot_error_log to anon, authenticated;
