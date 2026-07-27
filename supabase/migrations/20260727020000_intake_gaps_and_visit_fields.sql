-- Gap-fill after comparing the platform against 《Keloid 收案資料平台建置》 requirements doc
-- (2026-07-27). See project.md for the full comparison and open items.

-- Generic maintainable option-list + multi-select recording mechanism, mirroring the medical
-- term library (decision #5), covering onset cause / referral source / diet & exercise
-- education (replaces a plain checkbox per user decision 2026-07-27).
create table public.case_intake_option_lists (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('onset_cause','referral_source','diet_education','exercise_restriction')),
  label text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.case_intake_option_lists is 'Admin-maintainable option lists for intake checkboxes (onset cause, referral source, diet/exercise education topics) instead of a single fixed checkbox.';

create table public.case_intake_option_records (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  category text not null check (category in ('onset_cause','referral_source','diet_education','exercise_restriction')),
  recorded_at timestamptz not null default now(),
  recorded_by text not null,
  notes text
);
comment on table public.case_intake_option_records is 'A recorded multi-select selection of intake options for a case at a point in time.';

create table public.case_intake_option_record_items (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.case_intake_option_records(id) on delete cascade,
  option_id uuid not null references public.case_intake_option_lists(id),
  unique (record_id, option_id)
);
comment on table public.case_intake_option_record_items is 'Individual options selected within a case_intake_option_records entry (multi-select).';

alter table public.case_intake_option_lists enable row level security;
alter table public.case_intake_option_records enable row level security;
alter table public.case_intake_option_record_items enable row level security;

create policy anon_full_access on public.case_intake_option_lists for all to anon using (true) with check (true);
create policy anon_full_access on public.case_intake_option_records for all to anon using (true) with check (true);
create policy anon_full_access on public.case_intake_option_record_items for all to anon using (true) with check (true);

-- Basic-info gaps from the requirements doc.
alter table public.cases
  add column if not exists keloid_onset_date text,
  add column if not exists disease_history text,
  add column if not exists prior_treatment_physician text,
  add column if not exists prior_steroid_treatment text,
  add column if not exists prior_tcm_treatment text,
  add column if not exists prior_ogawa_patch text,
  add column if not exists prior_radiation_treatment text;

comment on column public.cases.keloid_onset_date is '蟹足腫初次發生時間（文字，允許概略日期如「2019年初」）。';
comment on column public.cases.disease_history is '一般疾病史，與 keloid_history（蟹足腫病史）不同。';
comment on column public.cases.prior_treatment_physician is '收案前於他院/他醫師曾接受治療的醫師資訊。';
comment on column public.cases.prior_steroid_treatment is '收案前曾接受的類固醇注射治療（治療多久、療程）。';
comment on column public.cases.prior_tcm_treatment is '收案前曾接受的中醫治療。';
comment on column public.cases.prior_ogawa_patch is '收案前曾使用的小川令貼布史。';
comment on column public.cases.prior_radiation_treatment is '收案前曾接受的放射線治療史。';

-- Biobank granularity gaps.
alter table public.biobank_samples
  add column if not exists cell_quantity text,
  add column if not exists storage_plate_count text;
comment on column public.biobank_samples.cell_quantity is '血液檢體細胞量。';
comment on column public.biobank_samples.storage_plate_count is '儲存盤數（與凍管位置 cryotube_location 是不同資訊）。';

-- New treatment types: ointment, patch, and a no-treatment follow-up observation.
insert into treatment_types (name, field_schema, sort_order)
select '藥膏', '[{"key":"drug","type":"text","label":"藥物名稱"},{"key":"frequency","type":"text","label":"使用頻率"}]'::jsonb, 6
where not exists (select 1 from treatment_types where name = '藥膏');

insert into treatment_types (name, field_schema, sort_order)
select '貼片', '[{"key":"product","type":"text","label":"產品名稱"},{"key":"days_used","type":"number","label":"使用天數"}]'::jsonb, 7
where not exists (select 1 from treatment_types where name = '貼片');

insert into treatment_types (name, field_schema, sort_order)
select '追蹤（無治療）', '[]'::jsonb, 8
where not exists (select 1 from treatment_types where name = '追蹤（無治療）');

-- Per-visit recurrence + blood-draw observation (decision 2026-07-27: treatment entry can now
-- multi-select several methods in one visit; recurrence moves from a single case-level snapshot
-- to something recordable at every visit; blood-draw tracking widens from the two fixed biobank
-- checklist timepoints to any visit, flagged as non-routine via the note field).
alter table public.treatment_records
  add column if not exists recurrence_observed boolean,
  add column if not exists recurrence_description text,
  add column if not exists blood_drawn boolean not null default false,
  add column if not exists blood_drawn_note text;

comment on column public.treatment_records.recurrence_observed is '此次追蹤是否觀察到復發（每次可記錄，非個案層級單一快照）。';
comment on column public.treatment_records.recurrence_description is '復發情形描述。';
comment on column public.treatment_records.blood_drawn is '此次是否有抽血；非固定於術前/術後第一天的常規抽血請於 blood_drawn_note 註記情境。';
comment on column public.treatment_records.blood_drawn_note is '抽血備註，例如註記非常規抽血的原因/情境。';
