-- 下次回診時間可設定 ＋ 回診提醒提前推播（2026-07-29）
--
-- 缺口：時程項目的 due_date 是「建檔日 + 範本天數」算出來的，但真正的回診日由掛號決定，
-- 兩者常差好幾天。平台原本沒有任何地方能改那個日期，所以推出去的回診提醒日子可能是錯的。

-- ① 提醒紀錄要能分辨「提前推」與「當天推」
-- 原本唯一索引是 (kind, ref_id, due_date)，提前 3 天那則與當天那則會撞成同一筆而漏推。
alter table public.line_reminder_log add column if not exists lead_days integer not null default 0;

comment on column public.line_reminder_log.lead_days is
  'How many days before due_date this reminder was sent. 3 = the heads-up, 0 = on the day (also covers overdue catch-up). Part of the uniqueness key so both can go out for the same item.';

drop index if exists line_reminder_log_once;
create unique index if not exists line_reminder_log_once
  on public.line_reminder_log (kind, ref_id, due_date, lead_days)
  where status = 'sent';

-- ② 所有追蹤時間點都要提醒（決策 2026-07-29）
-- 第 2 週與第 1 個月原本沒勾 visit_reminder，但那正是手術後變化最快、最容易忘記回診的階段。
update public.schedule_template_items
set actions = actions || '["visit_reminder"]'::jsonb
where not (actions @> '["visit_reminder"]'::jsonb);

-- 既有個案已經產生的待辦項目一併補上（已完成的不動，那是歷史）
update public.case_schedule_items
set actions = actions || '["visit_reminder"]'::jsonb
where status = 'pending' and not (actions @> '["visit_reminder"]'::jsonb);
