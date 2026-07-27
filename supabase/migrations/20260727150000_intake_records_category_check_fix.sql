-- BUGFIX：20260727070000（family_disease）與 20260727080000（keloid_history_type）新增 category 時
-- 只放寬了 case_intake_option_lists 的 CHECK，漏掉 case_intake_option_records，
-- 導致個案頁「keloid history → 新增紀錄」送出時噴
-- `violates check constraint "case_intake_option_records_category_check"`。
-- （family_disease 走的是 cases.family_history 文字欄位，所以先前沒被發現；
--   keloid_history_type 走 records 表才踩到。）
--
-- 注意：這兩張表的 category CHECK 必須同步維護，之後新增 category 時兩邊都要改。
alter table public.case_intake_option_records
  drop constraint if exists case_intake_option_records_category_check;

alter table public.case_intake_option_records
  add constraint case_intake_option_records_category_check
  check (category = any (array[
    'onset_cause', 'referral_source', 'diet_education', 'exercise_restriction',
    'family_disease', 'keloid_history_type'
  ]));

comment on column public.case_intake_option_records.category is
  'Intake option category. Must stay in sync with the same-named CHECK on case_intake_option_lists.category — adding a new category requires altering BOTH constraints.';
