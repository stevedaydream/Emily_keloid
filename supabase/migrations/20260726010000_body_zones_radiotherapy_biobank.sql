-- Fine-grained body-diagram zones, fixed radiotherapy dose protocols/sessions, and a
-- checklist-style biobank tracker. Added per 2026-07-26 department-head discussion
-- (see project.md "2026-07-26 架構調整"). Distinct from the legacy biobank_samples /
-- 放射治療 treatment_type added in 20260725052837_align_legacy_fields.sql, which remain
-- the course-level / free-text summary shape used for legacy Excel import.

create table public.body_part_zones (
  id uuid primary key default gen_random_uuid(),
  zone_key text not null unique,
  view text not null check (view in ('front','back')),
  display_name text not null,
  dose_category text not null check (dose_category in ('chest_scapular','ear','other')),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.body_part_zones is 'Fine-grained clickable body-diagram zones (front/back); each maps to one of the three fixed radiotherapy dose categories. Diagram geometry is hardcoded in the frontend component keyed by zone_key — this table only holds the maintainable label/category mapping.';

alter table public.cases add column if not exists body_part_zone_id uuid references public.body_part_zones(id);
comment on column public.cases.body_part_zone_id is 'Primary enrollment body zone selected via the body diagram; determines the radiotherapy dose category for auto-scheduling.';

create table public.radiotherapy_dose_protocols (
  dose_category text primary key check (dose_category in ('chest_scapular','ear','other')),
  label text not null,
  fraction_count int not null,
  per_fraction_dose_cgy int not null,
  total_dose_cgy int not null
);
comment on table public.radiotherapy_dose_protocols is 'Fixed radiotherapy dose/fractionation protocol per body-zone dose category (chest/scapular 18Gy x3, ear 8Gy x1, other 15Gy x2).';

create table public.radiotherapy_sessions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  dose_category text not null references public.radiotherapy_dose_protocols(dose_category),
  fraction_no int not null,
  total_fractions int not null,
  planned_dose_cgy int not null,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending','done','skipped')),
  completed_date date,
  actual_dose_cgy int,
  triggered_by_treatment_record_id uuid references public.treatment_records(id),
  created_at timestamptz not null default now(),
  unique (case_id, fraction_no, triggered_by_treatment_record_id)
);
comment on table public.radiotherapy_sessions is 'Per-fraction radiotherapy session tracking, auto-generated when a surgical-excision treatment record is logged for a case with a known dose category. Distinct from the summary 放射治療 treatment_type record (course totals for legacy/research export).';

create table public.biobank_checklist_items (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  item_key text not null check (item_key in (
    'tissue_paraffin_block','tissue_keloid_fibroblast_culture','tissue_periskin_fibroblast_culture',
    'blood_pre_op','blood_post_op_day1'
  )),
  item_label text not null,
  collected boolean not null default false,
  collected_date date,
  updated_at timestamptz not null default now(),
  unique (case_id, item_key)
);
comment on table public.biobank_checklist_items is 'Simple collected/date checklist per specimen item (tissue: paraffin block + two primary-culture types; blood: pre-op + post-op day 1). No custody (drawn-by/picked-up-by) or culture-outcome tracking by design (decision 2026-07-26).';

alter table public.body_part_zones enable row level security;
alter table public.radiotherapy_dose_protocols enable row level security;
alter table public.radiotherapy_sessions enable row level security;
alter table public.biobank_checklist_items enable row level security;

create policy anon_full_access on public.body_part_zones for all to anon using (true) with check (true);
create policy anon_full_access on public.radiotherapy_dose_protocols for all to anon using (true) with check (true);
create policy anon_full_access on public.radiotherapy_sessions for all to anon using (true) with check (true);
create policy anon_full_access on public.biobank_checklist_items for all to anon using (true) with check (true);

-- 衛教知識庫（Gemini 衛教機器人僅能依此回答）
create table public.health_education_kb (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  content text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.health_education_kb is 'Admin-maintained health-education knowledge base. The Gemini chatbot is instructed to answer strictly from this content and decline otherwise (decision 2026-07-26).';

alter table public.health_education_kb enable row level security;
create policy anon_full_access on public.health_education_kb for all to anon using (true) with check (true);

alter table public.photos add column if not exists body_part_zone_id uuid references public.body_part_zones(id);
comment on column public.photos.body_part_zone_id is 'Fine-grained body zone this photo was taken for (from the body diagram picker).';
