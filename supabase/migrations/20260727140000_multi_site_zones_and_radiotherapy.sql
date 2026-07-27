-- 多部位整合（決策 2026-07-27）：
-- 原本個案只有單一「主要部位」（cases.body_part_zone_id）決定放療劑量分類，
-- 但一個病人常同時有多處蟹足腫，各處部位分類不同（耳 8Gy×1 / 胸肩胛 18Gy×3 / 其他 15Gy×2），
-- 需要各自跑自己的放療療程。
--
-- 做法不是把 cases.body_part_zone_id 改成多對多，而是讓既有的多筆病灶清單
-- （case_keloid_lesions，已有部位編號 1,2… 與拍照連結）各自帶一個 body_part_zone_id。
-- 病灶清單因此成為部位的唯一真實來源，「主要部位」概念取消。

-- 1) 每個病灶各自的精細部位（→ 劑量分類）
alter table public.case_keloid_lesions
  add column if not exists body_part_zone_id uuid references public.body_part_zones(id);
comment on column public.case_keloid_lesions.body_part_zone_id is
  'Fine-grained body zone for this specific lesion; determines its own radiotherapy dose category. Replaces the former single cases.body_part_zone_id (decision 2026-07-27).';

-- 舊病灶回填：body_site 文字剛好等於某個 zone 名稱時直接對上
update public.case_keloid_lesions l
set body_part_zone_id = z.id
from public.body_part_zones z
where l.body_part_zone_id is null and btrim(l.body_site) = z.display_name;

-- 舊個案回填：有「主要部位」但還沒有任何病灶列的個案，把主要部位轉成部位1，
-- 讓這些個案在新模型下仍有部位分類可用（否則放療排程與資料完整度會突然失效）。
insert into public.case_keloid_lesions (case_id, site_no, body_site, body_part_zone_id, note)
select c.id, 1, z.display_name, z.id, '由原「主要部位」自動轉入'
from public.cases c
join public.body_part_zones z on z.id = c.body_part_zone_id
where not exists (select 1 from public.case_keloid_lesions l where l.case_id = c.id);

comment on column public.cases.body_part_zone_id is
  'DEPRECATED (2026-07-27): the single "primary body zone". Superseded by per-lesion case_keloid_lesions.body_part_zone_id. Kept for legacy-import alignment only; no longer written by the app.';
comment on column public.cases.body_site is
  'Denormalised summary of the case body sites (joined case_keloid_lesions.body_site), kept in sync by the app for list/search/dashboard display. Legacy-imported cases keep their original imported text.';

-- 2) 放療療程掛到病灶（每個部位各一組療程）
alter table public.radiotherapy_sessions
  add column if not exists lesion_id uuid references public.case_keloid_lesions(id) on delete cascade;
comment on column public.radiotherapy_sessions.lesion_id is
  'The lesion (body site) this radiotherapy course belongs to. One surgical-excision record per site generates its own course based on that site dose category. Null only for rows created before the 2026-07-27 multi-site change.';
create index if not exists idx_radiotherapy_sessions_lesion_id on public.radiotherapy_sessions(lesion_id);

-- 舊的放療列補上病灶（該個案上面剛轉入/唯一一個有部位分類的病灶）
update public.radiotherapy_sessions rs
set lesion_id = (
  select l.id from public.case_keloid_lesions l
  where l.case_id = rs.case_id and l.body_part_zone_id is not null
  order by l.site_no nulls last, l.created_at
  limit 1
)
where rs.lesion_id is null;

-- 原唯一鍵 (case_id, fraction_no, triggered_by_treatment_record_id) 會擋掉「同一天多部位手術」
-- 各自產生第 1 次療程，改為把 lesion_id 納入。用 unique index + coalesce 取代
-- `unique nulls not distinct`（後者需 PG15+），舊列 lesion_id/觸發紀錄為 null 時仍當同一個值比較。
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.radiotherapy_sessions'::regclass and contype = 'u'
  loop
    execute format('alter table public.radiotherapy_sessions drop constraint %I', c.conname);
  end loop;
end $$;

create unique index if not exists radiotherapy_sessions_course_uidx on public.radiotherapy_sessions (
  case_id,
  coalesce(lesion_id, '00000000-0000-0000-0000-000000000000'::uuid),
  fraction_no,
  coalesce(triggered_by_treatment_record_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- 3) 治療紀錄掛到病灶（同一次送出勾多個部位時，每個部位各建一筆紀錄）
alter table public.treatment_records
  add column if not exists lesion_id uuid references public.case_keloid_lesions(id) on delete set null;
comment on column public.treatment_records.lesion_id is
  'The case lesion (body site) this treatment record is for. body_site keeps a text snapshot (and is the only site info for free-text sites not in the lesion list).';
create index if not exists idx_treatment_records_lesion_id on public.treatment_records(lesion_id);

-- 舊治療紀錄回填：body_site 文字對得上該個案某個病灶時掛上去
update public.treatment_records t
set lesion_id = l.id
from public.case_keloid_lesions l
where t.lesion_id is null and l.case_id = t.case_id and btrim(t.body_site) = btrim(l.body_site);

-- 4) 資料完整度改看病灶清單，並修掉兩個已經失效的檢查條件
--    - 原本檢查 cases.body_part_zone_id（主要部位）→ 改為「至少一個病灶已指定部位分類」
--    - 原本檢查 cases.keloid_size：20260727080000 之後 UI 已改寫入 case_keloid_lesions，
--      這欄不再有新值，導致正常收案個案永遠無法達成完整度 → 改為看病灶尺寸（保留舊欄位當 legacy 判斷）
--    - 原本檢查 cases.keloid_history：同上，20260727080000 之後改記錄在
--      case_intake_option_records(category='keloid_history_type') → 兩者擇一即可
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
        and c.jsw_score is not null
        and c.family_history is not null
        and exists (
          select 1 from case_keloid_lesions l
          where l.case_id = c.id and l.body_part_zone_id is not null
        )
        and (
          c.keloid_history is not null
          or exists (
            select 1 from case_intake_option_records r
            where r.case_id = c.id and r.category = 'keloid_history_type'
          )
        )
        and (
          c.keloid_size is not null
          or exists (
            select 1 from case_keloid_lesions l
            where l.case_id = c.id
              and (l.length_cm is not null or l.width_cm is not null or l.height_cm is not null)
          )
        )
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
