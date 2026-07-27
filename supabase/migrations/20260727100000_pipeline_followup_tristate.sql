-- 「追蹤進行」原本只要「曾經」完成過一項時程／有問卷／有照片就恆亮 ✓，
-- 但實務上個案在時程尚未全部跑完前（例如某案例還有 6 個月、12 個月未完成）就已顯示打勾完成，容易誤判。
-- 改為三態：尚未開始（沒有任何時程項目）／進行中（有時程項目但還有 pending）／已完成（時程項目都不是 pending）。
-- step_followup 布林值保留（＝已完成，用於 steps_done／progress_pct 計算），
-- 另外新增 step_followup_status 文字欄位供前端畫出「進行中」的第三種圖示（不是打勾也不是純數字圈）。
--
-- Postgres 的 CREATE OR REPLACE VIEW 不能在既有欄位中間插入新欄位，
-- 且 v_dashboard_stats 依賴本 view，所以用 DROP ... CASCADE 後兩個 view 一起重建。
drop view if exists v_case_pipeline_progress cascade;

create view v_case_pipeline_progress as
with flags as (
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
        and c.body_part_zone_id is not null
        and c.jsw_score is not null
        and c.family_history is not null
        and c.keloid_history is not null
        and c.keloid_size is not null
    end as step_complete
  from cases c
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
