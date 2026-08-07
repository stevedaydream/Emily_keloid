-- LINE 綁定與提醒（2026-07-29，Phase 1 第一步）
--
-- 架構（沿用 2026-07-25 決策 #2）：GAS 當轉接層，平台不持有任何 LINE 憑證。
--   LINE ──webhook──> GAS ──帶 shared secret──> 平台 /api/line/*（業務邏輯與資料都在這裡）
--   GAS 的每日排程 ──> 平台 /api/line/reminders（回傳今天該推誰）──> GAS 用 Messaging API 推送 ──> 回報 ack
-- 這樣 channel token/secret 只存在 GAS，平台這邊即使外洩也發不了訊息。

-- ① 綁定碼的時效與綁定時間。cases.line_bind_code / line_user_id / line_bound 三欄早就存在但沒人寫入。
alter table public.cases add column if not exists line_bind_code_expires_at timestamptz;
alter table public.cases add column if not exists line_bound_at timestamptz;

comment on column public.cases.line_bind_code is 'One-time code the patient sends to the LINE official account to link their LINE user id to this research id. Cleared once bound.';
comment on column public.cases.line_bind_code_expires_at is 'Expiry for line_bind_code; expired codes are rejected so a leaked code cannot be used later.';

-- 綁定碼在有效期間內必須唯一，否則兩個病人同時拿到同一組碼會綁錯人
create unique index if not exists cases_line_bind_code_unique
  on public.cases (line_bind_code)
  where line_bind_code is not null;

-- 一個 LINE 帳號只能綁一個個案（同一支手機的家人要各自加好友）
create unique index if not exists cases_line_user_id_unique
  on public.cases (line_user_id)
  where line_user_id is not null;

-- ② 推播紀錄：避免同一件事重複推、也讓人員看得到到底有沒有送出去
create table if not exists public.line_reminder_log (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  kind text not null check (kind in ('visit', 'radiotherapy')),
  -- 對應的來源列：visit 是 case_schedule_items.id，radiotherapy 是 radiotherapy_sessions.id
  ref_id uuid not null,
  due_date date not null,
  line_user_id text,
  message text,
  status text not null default 'sent' check (status in ('sent', 'failed', 'skipped')),
  error text,
  sent_at timestamptz not null default now()
);

comment on table public.line_reminder_log is 'One row per reminder push attempt. The unique index below is what makes the daily job idempotent: re-running it never double-sends the same reminder.';

-- 同一個來源列、同一個到期日只推一次（失敗的不算，重跑時會再試）
create unique index if not exists line_reminder_log_once
  on public.line_reminder_log (kind, ref_id, due_date)
  where status = 'sent';

create index if not exists line_reminder_log_case_idx on public.line_reminder_log(case_id);

alter table public.line_reminder_log enable row level security;
create policy "anon full access" on public.line_reminder_log for all to anon using (true) with check (true);
