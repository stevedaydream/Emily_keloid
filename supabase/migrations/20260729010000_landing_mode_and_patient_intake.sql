-- 決策 2026-07-29：依身分分流 ＋ 病人自助填寫
--
-- 1) 操作者的「預設落點」：部長在門診連續收案時不該每建一位就被丟進完整個案頁，
--    也不該自己在導覽列找路。這是**動線**不是權限——landing_mode 只決定登入後落在哪一頁，
--    不阻擋任何人前往任何頁面（共用密碼＋切換操作者不需密碼，做權限也擋不住，留待 Phase 1）。
alter table public.operators
  add column if not exists landing_mode text not null default 'full'
  check (landing_mode in ('intake', 'full'));

comment on column public.operators.landing_mode is
  'Where this operator lands after picking their identity: intake = the streamlined /intake enrolment page (for the PI doing back-to-back enrolment), full = the normal dashboard + complete back office. A default landing only, NOT an access control.';

-- 部長預設落在收案頁；其餘維持完整後台。用 role 找是為了不寫死人名，
-- 但這只是初始值——之後一律由 /admin/operators 的下拉維護。
update public.operators
set landing_mode = 'intake'
where landing_mode = 'full' and (role ilike '%部長%' or role ilike '%PI%');

-- 2) 病人自助填寫的分段進度
--    病人要填的量（SF-36 36 題 + PSQI 18 題 + 病史區塊）在門診現場很容易被打斷，
--    所以每完成一段就寫入，重新打開能從斷點接續，個案頁也看得到「填到第幾段」。
create table if not exists public.case_patient_intake_progress (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  segment_key text not null,
  status text not null default 'done' check (status in ('done', 'skipped')),
  completed_at timestamptz not null default now(),
  -- 由誰操作那台裝置（病人自填 or 人員代填），對應 questionnaire_responses.submitted_via
  filled_via text not null default 'patient' check (filled_via in ('patient', 'staff')),
  unique (case_id, segment_key)
);

comment on table public.case_patient_intake_progress is
  'Per-segment completion of the patient self-entry flow (/patient/[caseId]/intake). One row per finished segment so the flow can resume after an interruption.';
comment on column public.case_patient_intake_progress.segment_key is
  'basic / history / intake_options / sf36 / psqi — see PATIENT_INTAKE_SEGMENTS in src/lib/patientIntake.ts.';

create index if not exists idx_case_patient_intake_progress_case on public.case_patient_intake_progress(case_id);

-- 3) 待人員補完的清單
--    病人版刻意不出現任何自由文字輸入（長輩在平板上打中文幾乎不可能，硬留只會得到空白）。
--    答「不知道」、答「有」但細節空著、或直接跳過的項目，改成在這裡列一筆，
--    讓專科護理師／助理問診時追問後補完。答「無」視為有效答案，不進這份清單。
create table if not exists public.case_intake_followups (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  field_key text not null,
  field_label text not null,
  reason text not null check (reason in ('unknown', 'no_detail', 'skipped')),
  -- 病人當下選了什麼（例如「有」但沒有細節），供人員追問時當上下文
  patient_answer text,
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  staff_note text,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (case_id, field_key)
);

comment on table public.case_intake_followups is
  'Gaps left by the patient self-entry flow that clinic staff need to fill in by asking the patient: answered "unknown", answered "yes" with no detail, or skipped. Distinct from case_data_completeness, which tracks per-field completeness of legacy-imported cases.';

create index if not exists idx_case_intake_followups_case on public.case_intake_followups(case_id, status);

grant select, insert, update, delete on public.case_patient_intake_progress to anon, authenticated;
grant select, insert, update, delete on public.case_intake_followups to anon, authenticated;

alter table public.case_patient_intake_progress enable row level security;
alter table public.case_intake_followups enable row level security;

-- Phase 0 沿用既有做法：anon 全開，存取控制在應用層（見 project.md「安全性備忘」與 pending.md C1）。
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'case_patient_intake_progress' and policyname = 'anon_all') then
    create policy anon_all on public.case_patient_intake_progress for all to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'case_intake_followups' and policyname = 'anon_all') then
    create policy anon_all on public.case_intake_followups for all to anon, authenticated using (true) with check (true);
  end if;
end $$;
