-- 上一版只檢查 性別/年齡/主要部位 三欄就判定「資料完整度」達成，但「病人基本資料」區塊實際上還有
-- JSW score／家族史／keloid history／keloid 大小 四個欄位，使用者反映即使這四個都是空的，燈號還是亮著。
-- 修正：正常收案的完整度改為要求「病人基本資料」區塊全部 7 個欄位都有值才算完成。
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
  step_created, step_consent, step_line, step_diagnosis, step_treatment, step_schedule, step_followup, step_complete,
  step_created::int + step_consent::int + step_line::int + step_diagnosis::int + step_treatment::int + step_schedule::int + step_followup::int + step_complete::int as steps_done,
  8 as steps_total,
  round((step_created::int + step_consent::int + step_line::int + step_diagnosis::int + step_treatment::int + step_schedule::int + step_followup::int + step_complete::int)::numeric * 100.0 / 8, 0) as progress_pct,
  (select min(s.due_date) from case_schedule_items s where s.case_id = f.case_id and s.status = 'pending') as next_due_date,
  (select count(*) from case_schedule_items s where s.case_id = f.case_id and s.status = 'pending' and s.due_date < current_date) as overdue_count,
  (select count(*) from case_data_completeness dc where dc.case_id = f.case_id and dc.status = 'pending') as pending_fields
from flags f;
