-- Per-case end-to-end intake pipeline progress ("收案一條龍").
create or replace view public.v_case_pipeline_progress
with (security_invoker = true) as
with flags as (
  select
    c.id            as case_id,
    c.research_id,
    c.doctor_id,
    c.enrollment_year,
    c.body_site,
    c.data_source,
    c.created_at,
    true                                as step_created,
    (c.consent_signed_at is not null)   as step_consent,
    coalesce(c.line_bound, false)       as step_line,
    exists(select 1 from public.case_diagnoses d      where d.case_id = c.id) as step_diagnosis,
    exists(select 1 from public.treatment_records t   where t.case_id = c.id) as step_treatment,
    exists(select 1 from public.case_schedule_items s where s.case_id = c.id) as step_schedule,
    (   exists(select 1 from public.case_schedule_items s where s.case_id = c.id and s.status = 'done')
     or exists(select 1 from public.questionnaire_responses q where q.case_id = c.id)
     or exists(select 1 from public.photos p where p.case_id = c.id)          ) as step_followup,
    not exists(select 1 from public.case_data_completeness dc
               where dc.case_id = c.id and dc.status = 'pending')             as step_complete
  from public.cases c
)
select
  f.*,
  (f.step_created::int + f.step_consent::int + f.step_line::int + f.step_diagnosis::int
   + f.step_treatment::int + f.step_schedule::int + f.step_followup::int + f.step_complete::int) as steps_done,
  8 as steps_total,
  round((f.step_created::int + f.step_consent::int + f.step_line::int + f.step_diagnosis::int
   + f.step_treatment::int + f.step_schedule::int + f.step_followup::int + f.step_complete::int) * 100.0 / 8) as progress_pct,
  (select min(s.due_date) from public.case_schedule_items s
     where s.case_id = f.case_id and s.status = 'pending') as next_due_date,
  (select count(*) from public.case_schedule_items s
     where s.case_id = f.case_id and s.status = 'pending' and s.due_date < current_date) as overdue_count,
  (select count(*) from public.case_data_completeness dc
     where dc.case_id = f.case_id and dc.status = 'pending') as pending_fields
from flags f;

comment on view public.v_case_pipeline_progress is 'Per-case intake pipeline progress: 8 stage flags (created, consent, LINE, diagnosis, treatment, schedule, follow-up, completeness) plus steps_done/progress_pct and next due / overdue counts.';

-- Aggregate dashboard KPIs (single row).
create or replace view public.v_dashboard_stats
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
