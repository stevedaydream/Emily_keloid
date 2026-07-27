-- 「資料完整度」階段（v_case_pipeline_progress.step_complete）原本只檢查 case_data_completeness 表，
-- 但那張表只在舊資料回溯建檔時才會有資料列，正常收案的個案完全沒有列，導致 NOT EXISTS(pending) 恆為真、
-- 這個燈號形同虛設，永遠亮著，即使基本資料（性別/年齡/主要部位）根本沒填。
-- 修正：正常收案改為直接檢查這幾個基本欄位是否都有值；舊資料回溯建檔維持原本用 case_data_completeness 判斷。
create or replace view v_case_pipeline_progress as
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
    (exists (select 1 from case_schedule_items s where s.case_id = c.id and s.status = 'done')
      or exists (select 1 from questionnaire_responses q where q.case_id = c.id)
      or exists (select 1 from photos p where p.case_id = c.id)) as step_followup,
    case
      when c.data_source = 'legacy_import' then
        not exists (select 1 from case_data_completeness dc where dc.case_id = c.id and dc.status = 'pending')
      else
        c.sex is not null and c.age_at_enrollment is not null and c.body_part_zone_id is not null
    end as step_complete
  from cases c
)
select
  case_id, research_id, doctor_id, enrollment_year, body_site, data_source, created_at,
  step_created, step_consent, step_line, step_diagnosis, step_treatment, step_schedule, step_followup, step_complete,
  step_created::int + step_consent::int + step_line::int + step_diagnosis::int + step_treatment::int + step_schedule::int + step_followup::int + step_complete::int as steps_done,
  8 as steps_total,
  round((step_created::int + step_consent::int + step_line::int + step_diagnosis::int + step_treatment::int + step_schedule::int + step_followup::int + step_complete::int)::numeric * 100.0 / 8, 0) as progress_pct,
  (select min(s.due_date) from case_schedule_items s where s.case_id = f.case_id and s.status = 'pending') as next_due_date,
  (select count(*) from case_schedule_items s where s.case_id = f.case_id and s.status = 'pending' and s.due_date < current_date) as overdue_count,
  (select count(*) from case_data_completeness dc where dc.case_id = f.case_id and dc.status = 'pending') as pending_fields
from flags f;
