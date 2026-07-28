-- Reusable column-mapping templates for the legacy data import wizard (/admin/import).
-- Mapping shape: { "<source column header>": "<target field key>" }, same shape as legacy_import_batches.column_mapping.
create table if not exists public.import_mapping_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  mapping jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now()
);

comment on table public.import_mapping_templates is 'Saved source-column -> platform-field mappings so a recurring legacy import file does not have to be re-mapped by hand each time.';

alter table public.import_mapping_templates enable row level security;

create policy "anon full access" on public.import_mapping_templates for all to anon using (true) with check (true);
