-- Align cases with de-identified research fields present in the legacy Excel workbook.
-- (Per architecture decision #1, name and medical-record-number are NEVER stored in the cloud.)
alter table public.cases
  add column if not exists sex text check (sex in ('M','F','other','unknown')),
  add column if not exists age_at_enrollment integer check (age_at_enrollment between 0 and 130),
  add column if not exists keloid_history text,
  add column if not exists keloid_size text,
  add column if not exists family_history text,
  add column if not exists jsw_score text,
  add column if not exists recurrence_status text check (recurrence_status in ('none','recurred','unknown','not_applicable')),
  add column if not exists recurrence_date date,
  add column if not exists days_to_recurrence integer,
  add column if not exists followup_cutoff_date date,
  add column if not exists over_one_year_flag boolean;

-- Legacy follow-up visits stored a free-text note per visit ("紀錄"); give schedule items a home for it.
alter table public.case_schedule_items add column if not exists note text;

-- Biobank / specimen tracking (legacy: 蠟塊編號 / 組織庫 / Primary culture / 細胞凍管位置).
create table if not exists public.biobank_samples (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  paraffin_block_no text,
  tissue_bank_status text,
  primary_culture text,
  cryotube_location text,
  sample_date date,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_biobank_samples_case_id on public.biobank_samples(case_id);
alter table public.biobank_samples enable row level security;
drop policy if exists anon_full_access on public.biobank_samples;
create policy anon_full_access on public.biobank_samples for all to anon using (true) with check (true);
grant all on public.biobank_samples to anon, authenticated;

-- Radiotherapy treatment type (legacy RT block) so OP/RT map into the existing treatment_records module.
insert into public.treatment_types (name, field_schema, sort_order)
select '放射治療', '[
  {"key":"total_dose_cgy","type":"number","label":"Total Dose (cGy)"},
  {"key":"fractions","type":"number","label":"Fractions"},
  {"key":"bolus","type":"text","label":"Bolus"},
  {"key":"electron_beam","type":"text","label":"Electron Beam Energy"},
  {"key":"treatment_response","type":"text","label":"Treatment Response"},
  {"key":"acute_reactions","type":"text","label":"Acute Reactions"}
]'::jsonb, 5
where not exists (select 1 from public.treatment_types where name = '放射治療');
