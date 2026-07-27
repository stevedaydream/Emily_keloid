-- Maintainable list of lab biomarkers tracked per case (admin-editable, mirrors term_library / case_intake_option_lists pattern)
create table if not exists public.lab_marker_definitions (
  id uuid primary key default gen_random_uuid(),
  marker_key text not null unique,
  display_name text not null,
  unit text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.lab_marker_definitions is 'Maintainable list of lab biomarkers (IgE, Exosome, IL-1a/1b/6, TNF-a, MMP2/9, etc.) tracked per case. Admin-editable via /admin/lab-markers.';

-- Per-case lab result entries: one row per case + marker + sample date
create table if not exists public.lab_results (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  marker_id uuid not null references public.lab_marker_definitions(id),
  sample_date date not null default current_date,
  value numeric,
  value_text text,
  note text,
  recorded_by text,
  created_at timestamptz not null default now()
);

comment on table public.lab_results is 'Per-case lab biomarker result entries. value holds a numeric reading when parseable; value_text preserves the raw lab-report string (e.g. qualifiers like "<0.35" or non-numeric results) when it is not.';

create index if not exists lab_results_case_id_idx on public.lab_results(case_id);
create index if not exists lab_results_marker_id_idx on public.lab_results(marker_id);

alter table public.lab_marker_definitions enable row level security;
alter table public.lab_results enable row level security;

create policy "anon full access" on public.lab_marker_definitions for all to anon using (true) with check (true);
create policy "anon full access" on public.lab_results for all to anon using (true) with check (true);

insert into public.lab_marker_definitions (marker_key, display_name, unit, sort_order) values
  ('ige', 'IgE', 'IU/mL', 10),
  ('exosome', 'Exosome', null, 20),
  ('il1a', 'IL-1α', 'pg/mL', 30),
  ('il1b', 'IL-1β', 'pg/mL', 40),
  ('il6', 'IL-6', 'pg/mL', 50),
  ('tnfa', 'TNF-α', 'pg/mL', 60),
  ('mmp2', 'MMP2', 'ng/mL', 70),
  ('mmp9', 'MMP9', 'ng/mL', 80)
on conflict (marker_key) do nothing;
