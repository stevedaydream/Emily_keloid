-- 決策 2026-08-20（pending.md F-D3）：追蹤範本＝每月一次 × 24 個月，24 筆全部保留不刪。
--
-- 臨床規則：「回診時醫師視情況穩定會改為每 2 個月追蹤，追蹤至 2 年」。
-- 使用者要求「每個月都保留，兩個月回診的病人中間那個月留空」——所以不刪項目，
-- 改成把跳過的月份標記為 skipped：
--   · 不算逾期（/clinic-today 的自動名單不撈它）
--   · 不推 LINE 回診提醒
--   · 匯出時視同未回診（FW 欄位維持填 0，見 pending.md D1）
-- 比直接刪除更有研究價值：事後查得到這個病人是從第幾個月開始降頻的。

-- case_schedule_items 不是由 migration 建的，status 上的 check constraint 叫什麼名字不確定，
-- 所以照定義內容找出來再刪，不能只賭預設命名。
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'case_schedule_items'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.case_schedule_items drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.case_schedule_items
  add constraint case_schedule_items_status_check
  check (status in ('pending', 'done', 'skipped'));

alter table public.case_schedule_items
  add column if not exists skipped_reason text;

comment on column public.case_schedule_items.status is
  'pending = due/upcoming, done = visit happened, skipped = clinician decided no visit this month (bimonthly follow-up). Skipped items are excluded from the overdue list and from LINE visit reminders, and count as "did not attend" on export.';
comment on column public.case_schedule_items.skipped_reason is
  'Why this time point was skipped, e.g. 醫師判定穩定，改為每 2 個月追蹤.';

-- 手術登記時產生的術後時程要跟舊的範本項目分得出來（重複登記手術切除時才不會長出兩套），
-- 抽血項目還要能對回 biobank_checklist_items（標記完成時單向回寫 collected/collected_date）。
alter table public.case_schedule_items
  add column if not exists source text,
  add column if not exists biobank_item_key text;

comment on column public.case_schedule_items.source is
  'post_op = generated from the surgery date (monthly follow-ups + blood draws). NULL = from a schedule template or added ad hoc.';
comment on column public.case_schedule_items.biobank_item_key is
  'When set, completing this schedule item writes collected/collected_date back to biobank_checklist_items for this item_key.';

create index if not exists case_schedule_items_case_source_idx
  on public.case_schedule_items(case_id, source);
