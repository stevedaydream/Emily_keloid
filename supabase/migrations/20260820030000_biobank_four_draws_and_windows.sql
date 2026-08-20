-- 決策 2026-08-20（pending.md F-E）：抽血改為 4 次，每次有窗期。
--
-- 計畫書：實驗組每人採靜脈血 10 mL × 4 次（共 40 mL）
--   ① 手術前 baseline
--   ② 術後第 3–7 天
--   ③ 術後第 28–35 天
--   ④ 手術日＋6 個月 ±14 天
--     （計畫書寫「治療完成後 6 個月」，但放療最長 1800×3 次＝3 天，
--       與手術日的差距遠小於 ±14 天窗期，故直接用手術日當錨點，不另設「治療完成日」欄位。）
--
-- 原本的 item_key 只有 blood_pre_op / blood_post_op_day1，第 3、4 次沒有欄位，
-- 而且第 2 次的定義（術後第 1 天）與計畫書（術後 3–7 天）對不上。

alter table public.biobank_checklist_items
  drop constraint if exists biobank_checklist_items_item_key_check;

-- 舊資料搬到新命名：post_op_day1 → post_op_d3_7（同一次抽血，定義修正）
update public.biobank_checklist_items
set item_key = 'blood_post_op_d3_7',
    item_label = '術後第 3–7 天抽血'
where item_key = 'blood_post_op_day1';

alter table public.biobank_checklist_items
  add constraint biobank_checklist_items_item_key_check
  check (item_key in (
    'tissue_paraffin_block','tissue_keloid_fibroblast_culture','tissue_periskin_fibroblast_culture',
    'blood_pre_op','blood_post_op_d3_7','blood_post_op_d28_35','blood_month6'
  ));

-- 窗期存起訖兩個日期，不存「中心 ± 容許天數」——3–7 天與 28–35 天都不對稱，
-- 用中心點表達會被迫存小數（28–35 的中心是 31.5）。
alter table public.biobank_checklist_items
  add column if not exists window_start date,
  add column if not exists window_end date;

comment on column public.biobank_checklist_items.window_start is
  'Earliest acceptable collection date per protocol. NULL = no window defined (tissue items).';
comment on column public.biobank_checklist_items.window_end is
  'Latest acceptable collection date per protocol. Collection outside [window_start, window_end] is recorded as-is and flagged as a protocol deviation — never blocked, since the specimen has already been drawn.';

comment on table public.biobank_checklist_items is
  'Per-specimen collected/date checklist. 2026-08-20: blood items extended to the four protocol draws (pre-op, post-op d3-7, post-op d28-35, month 6) with acceptance windows. Schedule items drive the reminders and write back collected/collected_date here on completion (single tick, both records).';
