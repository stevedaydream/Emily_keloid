-- 「資料完整」階段（v_case_pipeline_progress.step_complete）改對照現行資料模型。
--
-- 問題：非回溯建檔的個案，這一格檢查的是 cases.keloid_history、cases.keloid_size、
-- cases.body_part_zone_id 三個欄位，而**現在的介面一個都不會寫**——
--   · 病灶部位與長寬高在 2026-07-27 多部位整合時搬到 case_keloid_lesions（每顆各自帶）
--   · keloid_history 換成 case_intake_option_records 的 keloid_history_type 勾選
--   · keloid_size 隨之作廢
-- 實測 10 筆個案：這三欄全部是 0/10 有值，於是第 8 個燈號**永遠不會亮**，
-- 收案一條龍的上限固定在 7/8（88%），而且點下去的錨點 section-completeness
-- 只有回溯建檔的個案才會渲染，一般個案點了也不會動。
--
-- 這裡只做「同一個判定搬到今天的欄位」，不改判定的嚴格程度：
--   sex／age_at_enrollment／jsw_score／family_history  → 不變
--   body_part_zone_id（個案層）                        → 主病灶的 body_part_zone_id
--   keloid_size                                        → 主病灶有長寬高，或勾了「無法量測」免除
--   keloid_history                                     → **整條拿掉**，見下
--
-- keloid_history 的接班人本來應該是 case_intake_option_records 的 keloid_history_type
-- 勾選紀錄，但那個類別的選項清單 case_intake_option_lists 是**空的**——個案頁那個表單
-- 現在顯示「後台尚未設定選項」，一筆紀錄都建不出來。把它列進條件等於再造一次同樣的死結
-- （條件永遠不可能成立），所以先拿掉。之後若要收這一項，先到 /admin/intake-options
-- 建好 keloid_history_type 的選項，再把條件加回來。
-- 主病灶＝case_keloid_lesions.is_primary（助理 2026-08-24 裁決 JSS 評的那一顆）；
-- 舊資料沒勾主病灶時退回 site_no 最小的那顆，沿用個案頁與匯出的同一套慣例。
--
-- 回溯建檔（data_source = 'legacy_import'）那一支不動：它有自己的欄位盤點清單
-- case_data_completeness，判定就是「沒有 pending 的欄位」。
--
-- CREATE OR REPLACE VIEW 不能改既有欄位的順序/型別，且 v_dashboard_stats 依賴本 view，
-- 所以照 20260727100000 的做法 DROP ... CASCADE 後兩個 view 一起重建。

drop view if exists v_case_pipeline_progress cascade;

create view v_case_pipeline_progress as
with primary_lesion as (
  -- 每個個案取一顆代表病灶：優先 is_primary，其次 site_no 最小
  select distinct on (l.case_id)
    l.case_id, l.body_part_zone_id, l.length_cm, l.width_cm, l.height_cm, l.measure_waived
  from case_keloid_lesions l
  order by l.case_id, l.is_primary desc, l.site_no nulls last
),
flags as (
  select
    c.id as case_id,
    c.research_id,
    c.doctor_id,
    c.enrollment_year,
    c.body_site,
    c.data_source,
    c.created_at,
    true as step_created,
    c.consent_signed_at is not null as step_consent,
    coalesce(c.line_bound, false) as step_line,
    exists (select 1 from case_diagnoses d where d.case_id = c.id) as step_diagnosis,
    exists (select 1 from treatment_records t where t.case_id = c.id) as step_treatment,
    exists (select 1 from case_schedule_items s where s.case_id = c.id) as step_schedule,
    case
      when not exists (select 1 from case_schedule_items s where s.case_id = c.id) then 'not_started'
      when exists (select 1 from case_schedule_items s where s.case_id = c.id and s.status = 'pending') then 'in_progress'
      else 'done'
    end as step_followup_status,
    (exists (select 1 from case_schedule_items s where s.case_id = c.id)
      and not exists (select 1 from case_schedule_items s where s.case_id = c.id and s.status = 'pending')) as step_followup,
    case
      when c.data_source = 'legacy_import' then
        not exists (select 1 from case_data_completeness dc where dc.case_id = c.id and dc.status = 'pending')
      else
        c.sex is not null
        and c.age_at_enrollment is not null
        and c.jsw_score is not null
        and c.family_history is not null
        and pl.case_id is not null
        and pl.body_part_zone_id is not null
        and (
          pl.measure_waived
          or (pl.length_cm is not null and pl.width_cm is not null and pl.height_cm is not null)
        )
    end as step_complete
  from cases c
  left join primary_lesion pl on pl.case_id = c.id
)
select
  case_id, research_id, doctor_id, enrollment_year, body_site, data_source, created_at,
  step_created, step_consent, step_line, step_diagnosis, step_treatment, step_schedule, step_followup, step_followup_status, step_complete,
  step_created::int + step_consent::int + step_line::int + step_diagnosis::int + step_treatment::int + step_schedule::int + step_followup::int + step_complete::int as steps_done,
  8 as steps_total,
  round((step_created::int + step_consent::int + step_line::int + step_diagnosis::int + step_treatment::int + step_schedule::int + step_followup::int + step_complete::int)::numeric * 100.0 / 8, 0) as progress_pct,
  (select min(s.due_date) from case_schedule_items s where s.case_id = f.case_id and s.status = 'pending') as next_due_date,
  (select count(*) from case_schedule_items s where s.case_id = f.case_id and s.status = 'pending' and s.due_date < current_date) as overdue_count,
  (select count(*) from case_data_completeness dc where dc.case_id = f.case_id and dc.status = 'pending') as pending_fields
from flags f;

create view public.v_dashboard_stats
with (security_invoker = true) as
select
  (select count(*) from public.cases)                                              as total_cases,
  (select count(*) from public.cases where data_source = 'normal')                 as normal_cases,
  (select count(*) from public.cases where data_source = 'legacy_import')           as legacy_cases,
  (select count(*) from public.cases where consent_signed_at is not null)           as consent_signed,
  (select count(*) from public.cases where coalesce(line_bound,false))              as line_bound,
  (select count(*) from public.cases where recurrence_status = 'recurred')          as recurred_cases,
  (select count(*) from public.cases
     where recurrence_status is not null and recurrence_status <> 'unknown')        as recurrence_known,
  (select count(*) from public.cases
     where enrollment_year = extract(year from current_date)::int)                  as enrolled_this_year,
  (select count(*) from public.case_schedule_items where status = 'pending')        as pending_items,
  (select count(*) from public.case_schedule_items
     where status = 'pending' and due_date < current_date)                          as overdue_items,
  (select coalesce(round(avg(progress_pct)), 0) from public.v_case_pipeline_progress) as avg_pipeline_pct;

comment on view public.v_dashboard_stats is 'Single-row dashboard KPI summary derived from cases, schedule items and pipeline progress.';

grant select on public.v_case_pipeline_progress to anon, authenticated;
grant select on public.v_dashboard_stats to anon, authenticated;
