-- 決策 2026-08-20（pending.md F-F）：對照組是健康受試者，收在獨立簡表，不進 cases。
--
-- 為什麼不共用 cases：健康受試者沒有病灶、沒有 ICD 診斷、沒有手術、沒有追蹤、
-- 沒有 SF-36／PSQI。塞進 cases 會讓匯出的 Basic Info（206 欄）有 200 欄以上是
-- 「結構性永遠空白」，並污染所有以個案為單位的統計（收案數、追蹤率、缺值率）。
-- 分組資訊由「你在哪張表」決定，所以 cases 與 Basic Info 都不加分組欄位。

create table if not exists public.control_subjects (
  id uuid primary key default gen_random_uuid(),
  -- CTL-[年份]-[流水序號]，與實驗組的 [醫師碼]-[年份]-[序號] 分開編號
  subject_code text not null unique,
  enrollment_year int not null,
  sequence_no int not null,
  sex text check (sex in ('male', 'female')),
  age_at_enrollment int,
  -- 健康受試者抽血一樣要簽同意書；匯出的「排除未簽同意書」規則同樣適用
  consent_signed_at date,
  consent_confirmed_by text,
  -- 對照組只抽一次血
  blood_draw_date date,
  notes text,
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  unique (enrollment_year, sequence_no)
);

comment on table public.control_subjects is
  'Healthy-volunteer control arm: one person, one blood draw, nothing else. Deliberately NOT rows in cases — they have no lesion, diagnosis, surgery, follow-up or questionnaires, so they would leave 200+ Basic Info columns structurally blank (decision 2026-08-20).';
comment on column public.control_subjects.subject_code is
  'CTL-[year]-[sequence]. Separate numbering space from the study arm''s [doctorCode]-[year]-[sequence].';

create index if not exists control_subjects_year_idx on public.control_subjects(enrollment_year);

alter table public.control_subjects enable row level security;
drop policy if exists anon_full_access on public.control_subjects;
create policy anon_full_access on public.control_subjects for all to anon using (true) with check (true);
grant all on public.control_subjects to anon, authenticated;

-- Lab 生物標記兩組共用同一張表，否則跑組間比較要人工合併兩個來源。
alter table public.lab_results
  add column if not exists control_subject_id uuid references public.control_subjects(id) on delete cascade;

alter table public.lab_results alter column case_id drop not null;

alter table public.lab_results drop constraint if exists lab_results_subject_exactly_one;
alter table public.lab_results
  add constraint lab_results_subject_exactly_one
  check ((case_id is not null) <> (control_subject_id is not null));

create index if not exists lab_results_control_subject_id_idx on public.lab_results(control_subject_id);

comment on column public.lab_results.control_subject_id is
  'Set instead of case_id when this reading belongs to a healthy control. Exactly one of the two is always non-null.';
