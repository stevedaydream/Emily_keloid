-- ============================================================
-- 蟹足腫研究資料收集平台 — 資料庫結構（完整）
-- 由現行 Supabase 專案自動產生，供「搬到新的 Supabase 專案」時一次建好。
-- 只含結構，不含任何個案資料。參考資料（選單、問卷題庫…）在 02_seed.sql。
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

create table if not exists public.app_settings (
  key text not null,
  value jsonb not null,
  updated_at timestamp with time zone default now() not null,
  updated_by text,
  constraint app_settings_pkey PRIMARY KEY (key)
);

create table if not exists public.audit_log (
  id uuid default gen_random_uuid() not null,
  case_id uuid,
  operator_name text not null,
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint audit_log_pkey PRIMARY KEY (id)
);

create table if not exists public.biobank_checklist_items (
  id uuid default gen_random_uuid() not null,
  case_id uuid not null,
  item_key text not null,
  item_label text not null,
  collected boolean default false not null,
  collected_date date,
  updated_at timestamp with time zone default now() not null,
  window_start date,
  window_end date,
  constraint biobank_checklist_items_item_key_check CHECK ((item_key = ANY (ARRAY['tissue_paraffin_block'::text, 'tissue_keloid_fibroblast_culture'::text, 'tissue_periskin_fibroblast_culture'::text, 'blood_pre_op'::text, 'blood_post_op_d3_7'::text, 'blood_post_op_d28_35'::text, 'blood_month6'::text]))),
  constraint biobank_checklist_items_pkey PRIMARY KEY (id),
  constraint biobank_checklist_items_case_id_item_key_key UNIQUE (case_id, item_key)
);

create table if not exists public.biobank_samples (
  id uuid default gen_random_uuid() not null,
  case_id uuid not null,
  paraffin_block_no text,
  tissue_bank_status text,
  primary_culture text,
  cryotube_location text,
  sample_date date,
  notes text,
  created_at timestamp with time zone default now() not null,
  cell_quantity text,
  storage_plate_count text,
  constraint biobank_samples_pkey PRIMARY KEY (id),
  constraint biobank_samples_case_id_unique UNIQUE (case_id)
);

create table if not exists public.body_part_zones (
  id uuid default gen_random_uuid() not null,
  zone_key text not null,
  view text not null,
  display_name text not null,
  dose_category text not null,
  sort_order integer default 0 not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  export_code integer,
  export_label text,
  constraint body_part_zones_dose_category_check CHECK ((dose_category = ANY (ARRAY['chest_scapular'::text, 'ear'::text, 'other'::text]))),
  constraint body_part_zones_view_check CHECK ((view = ANY (ARRAY['front'::text, 'back'::text, 'head'::text]))),
  constraint body_part_zones_pkey PRIMARY KEY (id),
  constraint body_part_zones_zone_key_key UNIQUE (zone_key)
);

create table if not exists public.body_site_masks (
  id uuid default gen_random_uuid() not null,
  site_name text not null,
  mask_type text default 'generic'::text not null,
  mask_config jsonb default '{}'::jsonb not null,
  active boolean default true not null,
  constraint body_site_masks_mask_type_check CHECK ((mask_type = ANY (ARRAY['generic'::text, 'custom'::text]))),
  constraint body_site_masks_pkey PRIMARY KEY (id),
  constraint body_site_masks_site_name_key UNIQUE (site_name)
);

create table if not exists public.case_data_completeness (
  id uuid default gen_random_uuid() not null,
  case_id uuid not null,
  field_key text not null,
  field_label text not null,
  status text default 'pending'::text not null,
  note text,
  updated_at timestamp with time zone default now() not null,
  constraint case_data_completeness_status_check CHECK ((status = ANY (ARRAY['has_value'::text, 'pending'::text, 'not_applicable'::text]))),
  constraint case_data_completeness_pkey PRIMARY KEY (id),
  constraint case_data_completeness_case_id_field_key_key UNIQUE (case_id, field_key)
);

create table if not exists public.case_diagnoses (
  id uuid default gen_random_uuid() not null,
  case_id uuid not null,
  icd_code_id uuid not null,
  is_primary boolean default false not null,
  created_at timestamp with time zone default now() not null,
  constraint case_diagnoses_pkey PRIMARY KEY (id),
  constraint case_diagnoses_case_id_icd_code_id_key UNIQUE (case_id, icd_code_id)
);

create table if not exists public.case_intake_followups (
  id uuid default gen_random_uuid() not null,
  case_id uuid not null,
  field_key text not null,
  field_label text not null,
  reason text not null,
  patient_answer text,
  status text default 'pending'::text not null,
  staff_note text,
  resolved_by text,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint case_intake_followups_reason_check CHECK ((reason = ANY (ARRAY['unknown'::text, 'no_detail'::text, 'skipped'::text, 'waived'::text]))),
  constraint case_intake_followups_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'resolved'::text]))),
  constraint case_intake_followups_pkey PRIMARY KEY (id),
  constraint case_intake_followups_case_id_field_key_key UNIQUE (case_id, field_key)
);

create table if not exists public.case_intake_option_lists (
  id uuid default gen_random_uuid() not null,
  category text not null,
  label text not null,
  sort_order integer default 0 not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  export_code integer,
  constraint case_intake_option_lists_category_check CHECK ((category = ANY (ARRAY['onset_cause'::text, 'referral_source'::text, 'diet_education'::text, 'exercise_restriction'::text, 'family_disease'::text, 'keloid_history_type'::text, 'keloid_symptom'::text, 'symptom_change'::text, 'visit_reason'::text, 'self_disease'::text, 'ointment_patch'::text]))),
  constraint case_intake_option_lists_pkey PRIMARY KEY (id)
);

create table if not exists public.case_intake_option_record_items (
  id uuid default gen_random_uuid() not null,
  record_id uuid not null,
  option_id uuid not null,
  constraint case_intake_option_record_items_pkey PRIMARY KEY (id),
  constraint case_intake_option_record_items_record_id_option_id_key UNIQUE (record_id, option_id)
);

create table if not exists public.case_intake_option_records (
  id uuid default gen_random_uuid() not null,
  case_id uuid not null,
  category text not null,
  recorded_at timestamp with time zone default now() not null,
  recorded_by text not null,
  notes text,
  constraint case_intake_option_records_category_check CHECK ((category = ANY (ARRAY['onset_cause'::text, 'referral_source'::text, 'diet_education'::text, 'exercise_restriction'::text, 'family_disease'::text, 'keloid_history_type'::text, 'keloid_symptom'::text, 'symptom_change'::text, 'visit_reason'::text, 'self_disease'::text, 'ointment_patch'::text]))),
  constraint case_intake_option_records_pkey PRIMARY KEY (id)
);

create table if not exists public.case_keloid_lesions (
  id uuid default gen_random_uuid() not null,
  case_id uuid not null,
  body_site text not null,
  length_cm numeric,
  width_cm numeric,
  height_cm numeric,
  note text,
  created_at timestamp with time zone default now() not null,
  site_no integer,
  body_part_zone_id uuid,
  measure_waived boolean default false not null,
  measure_waived_reason text,
  photo_waived boolean default false not null,
  photo_waived_reason text,
  measured_at date,
  is_primary boolean default false not null,
  constraint case_keloid_lesions_pkey PRIMARY KEY (id)
);

create table if not exists public.case_patient_intake_progress (
  id uuid default gen_random_uuid() not null,
  case_id uuid not null,
  segment_key text not null,
  status text default 'done'::text not null,
  completed_at timestamp with time zone default now() not null,
  filled_via text default 'patient'::text not null,
  constraint case_patient_intake_progress_filled_via_check CHECK ((filled_via = ANY (ARRAY['patient'::text, 'staff'::text]))),
  constraint case_patient_intake_progress_status_check CHECK ((status = ANY (ARRAY['done'::text, 'skipped'::text]))),
  constraint case_patient_intake_progress_pkey PRIMARY KEY (id),
  constraint case_patient_intake_progress_case_id_segment_key_key UNIQUE (case_id, segment_key)
);

create table if not exists public.case_schedule_items (
  id uuid default gen_random_uuid() not null,
  case_id uuid not null,
  label text not null,
  due_date date not null,
  actions jsonb default '[]'::jsonb not null,
  questionnaire_id uuid,
  status text default 'pending'::text not null,
  completed_at timestamp with time zone,
  source_template_item_id uuid,
  created_at timestamp with time zone default now() not null,
  note text,
  skipped_reason text,
  source text,
  biobank_item_key text,
  constraint case_schedule_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'done'::text, 'skipped'::text]))),
  constraint case_schedule_items_pkey PRIMARY KEY (id)
);

create table if not exists public.case_term_record_items (
  id uuid default gen_random_uuid() not null,
  record_id uuid not null,
  term_id uuid not null,
  constraint case_term_record_items_pkey PRIMARY KEY (id),
  constraint case_term_record_items_record_id_term_id_key UNIQUE (record_id, term_id)
);

create table if not exists public.case_term_records (
  id uuid default gen_random_uuid() not null,
  case_id uuid not null,
  stage text not null,
  recorded_at timestamp with time zone default now() not null,
  recorded_by text not null,
  notes text,
  constraint case_term_records_stage_check CHECK ((stage = ANY (ARRAY['pre'::text, 'intra'::text, 'post'::text]))),
  constraint case_term_records_pkey PRIMARY KEY (id)
);

create table if not exists public.cases (
  id uuid default gen_random_uuid() not null,
  research_id text not null,
  doctor_id uuid not null,
  enrollment_year integer not null,
  sequence_no integer not null,
  phone_number text,
  line_bound boolean default false not null,
  line_bind_code text,
  line_user_id text,
  consent_signed_at date,
  consent_confirmed_by text,
  schedule_template_id uuid,
  data_source text default 'normal'::text not null,
  body_site text,
  created_at timestamp with time zone default now() not null,
  created_by text not null,
  notes text,
  sex text,
  age_at_enrollment integer,
  keloid_history text,
  keloid_size text,
  family_history text,
  jsw_score text,
  recurrence_status text,
  recurrence_date date,
  days_to_recurrence integer,
  followup_cutoff_date date,
  over_one_year_flag boolean,
  body_part_zone_id uuid,
  keloid_onset_date text,
  disease_history text,
  prior_treatment_physician text,
  prior_steroid_treatment text,
  prior_tcm_treatment text,
  prior_ogawa_patch text,
  prior_radiation_treatment text,
  line_bind_code_expires_at timestamp with time zone,
  line_bound_at timestamp with time zone,
  height_cm numeric,
  weight_kg numeric,
  birth_date date,
  is_test boolean default false not null,
  mrn text,
  patient_name text,
  constraint cases_age_at_enrollment_check CHECK (((age_at_enrollment >= 0) AND (age_at_enrollment <= 130))),
  constraint cases_data_source_check CHECK ((data_source = ANY (ARRAY['normal'::text, 'legacy_import'::text]))),
  constraint cases_recurrence_status_check CHECK ((recurrence_status = ANY (ARRAY['none'::text, 'recurred'::text, 'unknown'::text, 'not_applicable'::text]))),
  constraint cases_sex_check CHECK ((sex = ANY (ARRAY['M'::text, 'F'::text, 'other'::text, 'unknown'::text]))),
  constraint cases_pkey PRIMARY KEY (id),
  constraint cases_doctor_id_enrollment_year_sequence_no_key UNIQUE (doctor_id, enrollment_year, sequence_no),
  constraint cases_research_id_key UNIQUE (research_id)
);

create table if not exists public.control_subjects (
  id uuid default gen_random_uuid() not null,
  subject_code text not null,
  enrollment_year integer not null,
  sequence_no integer not null,
  sex text,
  age_at_enrollment integer,
  consent_signed_at date,
  consent_confirmed_by text,
  blood_draw_date date,
  notes text,
  active boolean default true not null,
  created_by text,
  created_at timestamp with time zone default now() not null,
  constraint control_subjects_sex_check CHECK ((sex = ANY (ARRAY['male'::text, 'female'::text]))),
  constraint control_subjects_pkey PRIMARY KEY (id),
  constraint control_subjects_enrollment_year_sequence_no_key UNIQUE (enrollment_year, sequence_no),
  constraint control_subjects_subject_code_key UNIQUE (subject_code)
);

create table if not exists public.doctors (
  id uuid default gen_random_uuid() not null,
  code text not null,
  name text not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  export_code integer,
  constraint doctors_pkey PRIMARY KEY (id),
  constraint doctors_code_key UNIQUE (code)
);

create table if not exists public.health_education_kb (
  id uuid default gen_random_uuid() not null,
  topic text not null,
  content text not null,
  active boolean default true not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  category text,
  pdf_url text,
  video_url text,
  constraint health_education_kb_pkey PRIMARY KEY (id)
);

create table if not exists public.icd_codes (
  id uuid default gen_random_uuid() not null,
  code text not null,
  system text not null,
  description_full text not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  mapping_key text,
  export_code integer,
  constraint icd_codes_system_check CHECK ((system = ANY (ARRAY['ICD9'::text, 'ICD10'::text]))),
  constraint icd_codes_pkey PRIMARY KEY (id),
  constraint icd_codes_code_system_key UNIQUE (code, system)
);

create table if not exists public.import_mapping_templates (
  id uuid default gen_random_uuid() not null,
  name text not null,
  mapping jsonb default '{}'::jsonb not null,
  created_by text,
  created_at timestamp with time zone default now() not null,
  constraint import_mapping_templates_pkey PRIMARY KEY (id),
  constraint import_mapping_templates_name_key UNIQUE (name)
);

create table if not exists public.lab_marker_definitions (
  id uuid default gen_random_uuid() not null,
  marker_key text not null,
  display_name text not null,
  unit text,
  sort_order integer default 0 not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  constraint lab_marker_definitions_pkey PRIMARY KEY (id),
  constraint lab_marker_definitions_marker_key_key UNIQUE (marker_key)
);

create table if not exists public.lab_results (
  id uuid default gen_random_uuid() not null,
  case_id uuid,
  marker_id uuid not null,
  sample_date date default CURRENT_DATE not null,
  value numeric,
  value_text text,
  note text,
  recorded_by text,
  created_at timestamp with time zone default now() not null,
  control_subject_id uuid,
  constraint lab_results_subject_exactly_one CHECK (((case_id IS NOT NULL) <> (control_subject_id IS NOT NULL))),
  constraint lab_results_pkey PRIMARY KEY (id)
);

create table if not exists public.legacy_import_batches (
  id uuid default gen_random_uuid() not null,
  source_filename text not null,
  column_mapping jsonb default '{}'::jsonb not null,
  imported_at timestamp with time zone default now() not null,
  imported_by text not null,
  status text default 'staged'::text not null,
  total_rows integer default 0 not null,
  committed_rows integer default 0 not null,
  constraint legacy_import_batches_status_check CHECK ((status = ANY (ARRAY['staged'::text, 'reviewed'::text, 'committed'::text]))),
  constraint legacy_import_batches_pkey PRIMARY KEY (id)
);

create table if not exists public.legacy_import_rows (
  id uuid default gen_random_uuid() not null,
  batch_id uuid not null,
  row_number integer not null,
  raw_data jsonb not null,
  mapped_data jsonb default '{}'::jsonb not null,
  research_id text,
  validation_errors jsonb default '[]'::jsonb not null,
  status text default 'pending'::text not null,
  committed_case_id uuid,
  constraint legacy_import_rows_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'committed'::text, 'rejected'::text]))),
  constraint legacy_import_rows_pkey PRIMARY KEY (id)
);

create table if not exists public.line_bot_error_log (
  id uuid default gen_random_uuid() not null,
  occurred_at timestamp with time zone default now() not null,
  stage text not null,
  reason text not null,
  source text default 'line'::text not null,
  constraint line_bot_error_log_source_check CHECK ((source = ANY (ARRAY['line'::text, 'kb_chat'::text]))),
  constraint line_bot_error_log_stage_check CHECK ((stage = ANY (ARRAY['gemini_match'::text, 'gemini_rewrite'::text]))),
  constraint line_bot_error_log_pkey PRIMARY KEY (id)
);

create table if not exists public.line_message_templates (
  key text not null,
  content text not null,
  updated_at timestamp with time zone default now() not null,
  updated_by text,
  constraint line_message_templates_pkey PRIMARY KEY (key)
);

create table if not exists public.line_reminder_log (
  id uuid default gen_random_uuid() not null,
  case_id uuid not null,
  kind text not null,
  ref_id uuid not null,
  due_date date not null,
  line_user_id text,
  message text,
  status text default 'sent'::text not null,
  error text,
  sent_at timestamp with time zone default now() not null,
  lead_days integer default 0 not null,
  constraint line_reminder_log_kind_check CHECK ((kind = ANY (ARRAY['visit'::text, 'radiotherapy'::text]))),
  constraint line_reminder_log_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text, 'skipped'::text]))),
  constraint line_reminder_log_pkey PRIMARY KEY (id)
);

create table if not exists public.operators (
  id uuid default gen_random_uuid() not null,
  name text not null,
  role text,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  landing_mode text default 'dashboard'::text not null,
  dev_mobile_mapping boolean default false not null,
  nav_compact boolean default false not null,
  sort_order integer default 100 not null,
  is_system_admin boolean default false not null,
  constraint operators_landing_mode_check CHECK ((landing_mode = ANY (ARRAY['clinic_today'::text, 'intake'::text, 'batch_edit'::text, 'dashboard'::text, 'admin'::text]))),
  constraint operators_pkey PRIMARY KEY (id),
  constraint operators_name_key UNIQUE (name)
);

create table if not exists public.photos (
  id uuid default gen_random_uuid() not null,
  case_id uuid not null,
  schedule_item_id uuid,
  file_path text not null,
  taken_at timestamp with time zone default now() not null,
  body_site text,
  mask_type text,
  uploaded_by text not null,
  uploaded_via text default 'line_sim'::text not null,
  created_at timestamp with time zone default now() not null,
  body_part_zone_id uuid,
  thumbnail_path text,
  lesion_id uuid,
  source text default 'camera'::text not null,
  constraint photos_uploaded_via_check CHECK ((uploaded_via = ANY (ARRAY['line_sim'::text, 'staff'::text, 'patient'::text]))),
  constraint photos_source_check CHECK ((source = ANY (ARRAY['camera'::text, 'upload'::text]))),
  constraint photos_pkey PRIMARY KEY (id)
);

create table if not exists public.questionnaire_answers (
  id uuid default gen_random_uuid() not null,
  response_id uuid not null,
  question_id uuid not null,
  answer_value jsonb not null,
  updated_at timestamp with time zone,
  updated_by text,
  constraint questionnaire_answers_pkey PRIMARY KEY (id),
  constraint questionnaire_answers_response_id_question_id_key UNIQUE (response_id, question_id)
);

create table if not exists public.questionnaire_questions (
  id uuid default gen_random_uuid() not null,
  questionnaire_id uuid not null,
  order_no integer default 0 not null,
  question_text text not null,
  question_type text not null,
  options jsonb default '[]'::jsonb not null,
  required boolean default false not null,
  created_at timestamp with time zone default now() not null,
  constraint questionnaire_questions_question_type_check CHECK ((question_type = ANY (ARRAY['single'::text, 'multi'::text, 'number'::text, 'text'::text, 'scale'::text]))),
  constraint questionnaire_questions_pkey PRIMARY KEY (id)
);

create table if not exists public.questionnaire_responses (
  id uuid default gen_random_uuid() not null,
  case_id uuid not null,
  questionnaire_id uuid not null,
  schedule_item_id uuid,
  submitted_at timestamp with time zone default now() not null,
  submitted_via text default 'line_sim'::text not null,
  completed_at timestamp with time zone,
  constraint questionnaire_responses_submitted_via_check CHECK ((submitted_via = ANY (ARRAY['line_sim'::text, 'staff'::text, 'patient'::text]))),
  constraint questionnaire_responses_pkey PRIMARY KEY (id)
);

create table if not exists public.questionnaire_templates (
  id uuid default gen_random_uuid() not null,
  name text not null,
  description text,
  category text default 'other'::text not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  required_for_intake boolean default false not null,
  constraint questionnaire_templates_category_check CHECK ((category = ANY (ARRAY['scale'::text, 'lifestyle'::text, 'other'::text]))),
  constraint questionnaire_templates_pkey PRIMARY KEY (id)
);

create table if not exists public.radiotherapy_doctors (
  id uuid default gen_random_uuid() not null,
  name text not null,
  export_code integer,
  sort_order integer default 99 not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  constraint radiotherapy_doctors_pkey PRIMARY KEY (id),
  constraint radiotherapy_doctors_name_key UNIQUE (name)
);

create table if not exists public.radiotherapy_dose_protocols (
  dose_category text not null,
  label text not null,
  fraction_count integer not null,
  per_fraction_dose_cgy integer not null,
  total_dose_cgy integer not null,
  constraint radiotherapy_dose_protocols_dose_category_check CHECK ((dose_category = ANY (ARRAY['chest_scapular'::text, 'ear'::text, 'other'::text]))),
  constraint radiotherapy_dose_protocols_pkey PRIMARY KEY (dose_category)
);

create table if not exists public.radiotherapy_sessions (
  id uuid default gen_random_uuid() not null,
  case_id uuid not null,
  dose_category text not null,
  fraction_no integer not null,
  total_fractions integer not null,
  planned_dose_cgy integer not null,
  due_date date not null,
  status text default 'pending'::text not null,
  completed_date date,
  actual_dose_cgy integer,
  triggered_by_treatment_record_id uuid,
  created_at timestamp with time zone default now() not null,
  lesion_id uuid,
  rt_doctor text,
  constraint radiotherapy_sessions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'done'::text, 'skipped'::text]))),
  constraint radiotherapy_sessions_pkey PRIMARY KEY (id)
);

create table if not exists public.schedule_template_items (
  id uuid default gen_random_uuid() not null,
  template_id uuid not null,
  label text not null,
  offset_days integer not null,
  actions jsonb default '[]'::jsonb not null,
  questionnaire_id uuid,
  sort_order integer default 0 not null,
  constraint schedule_template_items_pkey PRIMARY KEY (id)
);

create table if not exists public.schedule_templates (
  id uuid default gen_random_uuid() not null,
  name text not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  constraint schedule_templates_pkey PRIMARY KEY (id)
);

create table if not exists public.term_library (
  id uuid default gen_random_uuid() not null,
  stage text not null,
  term text not null,
  image_url text,
  active boolean default true not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  constraint term_library_stage_check CHECK ((stage = ANY (ARRAY['pre'::text, 'intra'::text, 'post'::text]))),
  constraint term_library_pkey PRIMARY KEY (id)
);

create table if not exists public.treatment_presets (
  id uuid default gen_random_uuid() not null,
  treatment_type_id uuid not null,
  name text not null,
  field_values jsonb default '{}'::jsonb not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  created_by text,
  constraint treatment_presets_pkey PRIMARY KEY (id)
);

create table if not exists public.treatment_records (
  id uuid default gen_random_uuid() not null,
  case_id uuid not null,
  treatment_type_id uuid not null,
  preset_id uuid,
  field_values jsonb default '{}'::jsonb not null,
  free_text text,
  treatment_date date not null,
  recorded_by text not null,
  created_at timestamp with time zone default now() not null,
  recurrence_observed boolean,
  recurrence_description text,
  blood_drawn boolean default false not null,
  blood_drawn_note text,
  body_site text,
  lesion_id uuid,
  symptom_change_option_id uuid,
  constraint treatment_records_pkey PRIMARY KEY (id)
);

create table if not exists public.treatment_types (
  id uuid default gen_random_uuid() not null,
  name text not null,
  field_schema jsonb default '[]'::jsonb not null,
  active boolean default true not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  export_code integer,
  constraint treatment_types_pkey PRIMARY KEY (id),
  constraint treatment_types_name_key UNIQUE (name)
);

-- ---- 外來鍵 ----
alter table public.audit_log add constraint audit_log_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL;
alter table public.biobank_checklist_items add constraint biobank_checklist_items_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
alter table public.biobank_samples add constraint biobank_samples_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
alter table public.case_data_completeness add constraint case_data_completeness_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
alter table public.case_diagnoses add constraint case_diagnoses_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
alter table public.case_diagnoses add constraint case_diagnoses_icd_code_id_fkey FOREIGN KEY (icd_code_id) REFERENCES icd_codes(id);
alter table public.case_intake_followups add constraint case_intake_followups_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
alter table public.case_intake_option_record_items add constraint case_intake_option_record_items_option_id_fkey FOREIGN KEY (option_id) REFERENCES case_intake_option_lists(id);
alter table public.case_intake_option_record_items add constraint case_intake_option_record_items_record_id_fkey FOREIGN KEY (record_id) REFERENCES case_intake_option_records(id) ON DELETE CASCADE;
alter table public.case_intake_option_records add constraint case_intake_option_records_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
alter table public.case_keloid_lesions add constraint case_keloid_lesions_body_part_zone_id_fkey FOREIGN KEY (body_part_zone_id) REFERENCES body_part_zones(id);
alter table public.case_keloid_lesions add constraint case_keloid_lesions_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
alter table public.case_patient_intake_progress add constraint case_patient_intake_progress_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
alter table public.case_schedule_items add constraint case_schedule_items_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
alter table public.case_schedule_items add constraint case_schedule_items_questionnaire_id_fkey FOREIGN KEY (questionnaire_id) REFERENCES questionnaire_templates(id);
alter table public.case_schedule_items add constraint case_schedule_items_source_template_item_id_fkey FOREIGN KEY (source_template_item_id) REFERENCES schedule_template_items(id);
alter table public.case_term_record_items add constraint case_term_record_items_record_id_fkey FOREIGN KEY (record_id) REFERENCES case_term_records(id) ON DELETE CASCADE;
alter table public.case_term_record_items add constraint case_term_record_items_term_id_fkey FOREIGN KEY (term_id) REFERENCES term_library(id);
alter table public.case_term_records add constraint case_term_records_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
alter table public.cases add constraint cases_body_part_zone_id_fkey FOREIGN KEY (body_part_zone_id) REFERENCES body_part_zones(id);
alter table public.cases add constraint cases_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES doctors(id);
alter table public.cases add constraint fk_cases_schedule_template FOREIGN KEY (schedule_template_id) REFERENCES schedule_templates(id);
alter table public.lab_results add constraint lab_results_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
alter table public.lab_results add constraint lab_results_control_subject_id_fkey FOREIGN KEY (control_subject_id) REFERENCES control_subjects(id) ON DELETE CASCADE;
alter table public.lab_results add constraint lab_results_marker_id_fkey FOREIGN KEY (marker_id) REFERENCES lab_marker_definitions(id);
alter table public.legacy_import_rows add constraint legacy_import_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES legacy_import_batches(id) ON DELETE CASCADE;
alter table public.legacy_import_rows add constraint legacy_import_rows_committed_case_id_fkey FOREIGN KEY (committed_case_id) REFERENCES cases(id);
alter table public.line_reminder_log add constraint line_reminder_log_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
alter table public.photos add constraint photos_body_part_zone_id_fkey FOREIGN KEY (body_part_zone_id) REFERENCES body_part_zones(id);
alter table public.photos add constraint photos_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
alter table public.photos add constraint photos_lesion_id_fkey FOREIGN KEY (lesion_id) REFERENCES case_keloid_lesions(id) ON DELETE SET NULL;
alter table public.photos add constraint photos_schedule_item_id_fkey FOREIGN KEY (schedule_item_id) REFERENCES case_schedule_items(id);
alter table public.questionnaire_answers add constraint questionnaire_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES questionnaire_questions(id);
alter table public.questionnaire_answers add constraint questionnaire_answers_response_id_fkey FOREIGN KEY (response_id) REFERENCES questionnaire_responses(id) ON DELETE CASCADE;
alter table public.questionnaire_questions add constraint questionnaire_questions_questionnaire_id_fkey FOREIGN KEY (questionnaire_id) REFERENCES questionnaire_templates(id) ON DELETE CASCADE;
alter table public.questionnaire_responses add constraint fk_qresp_schedule_item FOREIGN KEY (schedule_item_id) REFERENCES case_schedule_items(id);
alter table public.questionnaire_responses add constraint questionnaire_responses_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
alter table public.questionnaire_responses add constraint questionnaire_responses_questionnaire_id_fkey FOREIGN KEY (questionnaire_id) REFERENCES questionnaire_templates(id);
alter table public.radiotherapy_sessions add constraint radiotherapy_sessions_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
alter table public.radiotherapy_sessions add constraint radiotherapy_sessions_dose_category_fkey FOREIGN KEY (dose_category) REFERENCES radiotherapy_dose_protocols(dose_category);
alter table public.radiotherapy_sessions add constraint radiotherapy_sessions_lesion_id_fkey FOREIGN KEY (lesion_id) REFERENCES case_keloid_lesions(id) ON DELETE CASCADE;
alter table public.radiotherapy_sessions add constraint radiotherapy_sessions_triggered_by_treatment_record_id_fkey FOREIGN KEY (triggered_by_treatment_record_id) REFERENCES treatment_records(id);
alter table public.schedule_template_items add constraint schedule_template_items_questionnaire_id_fkey FOREIGN KEY (questionnaire_id) REFERENCES questionnaire_templates(id);
alter table public.schedule_template_items add constraint schedule_template_items_template_id_fkey FOREIGN KEY (template_id) REFERENCES schedule_templates(id) ON DELETE CASCADE;
alter table public.treatment_presets add constraint treatment_presets_treatment_type_id_fkey FOREIGN KEY (treatment_type_id) REFERENCES treatment_types(id) ON DELETE CASCADE;
alter table public.treatment_records add constraint treatment_records_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
alter table public.treatment_records add constraint treatment_records_lesion_id_fkey FOREIGN KEY (lesion_id) REFERENCES case_keloid_lesions(id) ON DELETE SET NULL;
alter table public.treatment_records add constraint treatment_records_preset_id_fkey FOREIGN KEY (preset_id) REFERENCES treatment_presets(id);
alter table public.treatment_records add constraint treatment_records_symptom_change_option_id_fkey FOREIGN KEY (symptom_change_option_id) REFERENCES case_intake_option_lists(id);
alter table public.treatment_records add constraint treatment_records_treatment_type_id_fkey FOREIGN KEY (treatment_type_id) REFERENCES treatment_types(id);

-- ---- 索引 ----
CREATE UNIQUE INDEX case_keloid_lesions_one_primary_per_case ON public.case_keloid_lesions USING btree (case_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS case_schedule_items_case_source_idx ON public.case_schedule_items USING btree (case_id, source);
CREATE INDEX IF NOT EXISTS cases_is_test_idx ON public.cases USING btree (is_test) WHERE is_test;
CREATE UNIQUE INDEX cases_line_bind_code_unique ON public.cases USING btree (line_bind_code) WHERE (line_bind_code IS NOT NULL);
CREATE UNIQUE INDEX cases_line_user_id_unique ON public.cases USING btree (line_user_id) WHERE (line_user_id IS NOT NULL);
CREATE UNIQUE INDEX cases_mrn_unique ON public.cases USING btree (mrn) WHERE ((mrn IS NOT NULL) AND (mrn <> ''::text));
CREATE INDEX IF NOT EXISTS cases_patient_name_idx ON public.cases USING btree (patient_name) WHERE (patient_name IS NOT NULL);
CREATE INDEX IF NOT EXISTS control_subjects_year_idx ON public.control_subjects USING btree (enrollment_year);
CREATE INDEX IF NOT EXISTS idx_audit_log_case ON public.audit_log USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_biobank_samples_case_id ON public.biobank_samples USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_case_intake_followups_case ON public.case_intake_followups USING btree (case_id, status);
CREATE INDEX IF NOT EXISTS idx_case_patient_intake_progress_case ON public.case_patient_intake_progress USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_cases_research_id ON public.cases USING btree (research_id);
CREATE INDEX IF NOT EXISTS idx_icd_codes_mapping_key ON public.icd_codes USING btree (mapping_key);
CREATE INDEX IF NOT EXISTS idx_photos_lesion_id ON public.photos USING btree (lesion_id);
CREATE INDEX IF NOT EXISTS idx_radiotherapy_sessions_lesion_id ON public.radiotherapy_sessions USING btree (lesion_id);
CREATE INDEX IF NOT EXISTS idx_treatment_records_lesion_id ON public.treatment_records USING btree (lesion_id);
CREATE INDEX IF NOT EXISTS idx_treatment_records_symptom_change ON public.treatment_records USING btree (symptom_change_option_id);
CREATE INDEX IF NOT EXISTS lab_results_case_id_idx ON public.lab_results USING btree (case_id);
CREATE INDEX IF NOT EXISTS lab_results_control_subject_id_idx ON public.lab_results USING btree (control_subject_id);
CREATE INDEX IF NOT EXISTS lab_results_marker_id_idx ON public.lab_results USING btree (marker_id);
CREATE INDEX IF NOT EXISTS line_bot_error_log_time_idx ON public.line_bot_error_log USING btree (occurred_at DESC);
CREATE INDEX IF NOT EXISTS line_reminder_log_case_idx ON public.line_reminder_log USING btree (case_id);
CREATE UNIQUE INDEX line_reminder_log_once ON public.line_reminder_log USING btree (kind, ref_id, due_date, lead_days) WHERE (status = 'sent'::text);
CREATE UNIQUE INDEX radiotherapy_sessions_course_uidx ON public.radiotherapy_sessions USING btree (case_id, COALESCE(lesion_id, '00000000-0000-0000-0000-000000000000'::uuid), fraction_no, COALESCE(triggered_by_treatment_record_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---- 檢視 ----
create or replace view public.v_case_pipeline_progress as
 WITH primary_lesion AS (
         SELECT DISTINCT ON (l.case_id) l.case_id,
            l.body_part_zone_id,
            l.length_cm,
            l.width_cm,
            l.height_cm,
            l.measure_waived
           FROM case_keloid_lesions l
          ORDER BY l.case_id, l.is_primary DESC, l.site_no
        ), flags AS (
         SELECT c.id AS case_id,
            c.research_id,
            c.doctor_id,
            c.enrollment_year,
            c.body_site,
            c.data_source,
            c.created_at,
            true AS step_created,
            c.consent_signed_at IS NOT NULL AS step_consent,
            COALESCE(c.line_bound, false) AS step_line,
            (EXISTS ( SELECT 1
                   FROM case_diagnoses d
                  WHERE d.case_id = c.id)) AS step_diagnosis,
            (EXISTS ( SELECT 1
                   FROM treatment_records t
                  WHERE t.case_id = c.id)) AS step_treatment,
            (EXISTS ( SELECT 1
                   FROM case_schedule_items s
                  WHERE s.case_id = c.id)) AS step_schedule,
                CASE
                    WHEN NOT (EXISTS ( SELECT 1
                       FROM case_schedule_items s
                      WHERE s.case_id = c.id)) THEN 'not_started'::text
                    WHEN (EXISTS ( SELECT 1
                       FROM case_schedule_items s
                      WHERE s.case_id = c.id AND s.status = 'pending'::text)) THEN 'in_progress'::text
                    ELSE 'done'::text
                END AS step_followup_status,
            (EXISTS ( SELECT 1
                   FROM case_schedule_items s
                  WHERE s.case_id = c.id)) AND NOT (EXISTS ( SELECT 1
                   FROM case_schedule_items s
                  WHERE s.case_id = c.id AND s.status = 'pending'::text)) AS step_followup,
                CASE
                    WHEN c.data_source = 'legacy_import'::text THEN NOT (EXISTS ( SELECT 1
                       FROM case_data_completeness dc
                      WHERE dc.case_id = c.id AND dc.status = 'pending'::text))
                    ELSE c.sex IS NOT NULL AND c.age_at_enrollment IS NOT NULL AND c.jsw_score IS NOT NULL AND c.family_history IS NOT NULL AND pl.case_id IS NOT NULL AND pl.body_part_zone_id IS NOT NULL AND (pl.measure_waived OR pl.length_cm IS NOT NULL AND pl.width_cm IS NOT NULL AND pl.height_cm IS NOT NULL)
                END AS step_complete
           FROM cases c
             LEFT JOIN primary_lesion pl ON pl.case_id = c.id
        )
 SELECT case_id,
    research_id,
    doctor_id,
    enrollment_year,
    body_site,
    data_source,
    created_at,
    step_created,
    step_consent,
    step_line,
    step_diagnosis,
    step_treatment,
    step_schedule,
    step_followup,
    step_followup_status,
    step_complete,
    step_created::integer + step_consent::integer + step_line::integer + step_diagnosis::integer + step_treatment::integer + step_schedule::integer + step_followup::integer + step_complete::integer AS steps_done,
    8 AS steps_total,
    round((step_created::integer + step_consent::integer + step_line::integer + step_diagnosis::integer + step_treatment::integer + step_schedule::integer + step_followup::integer + step_complete::integer)::numeric * 100.0 / 8::numeric, 0) AS progress_pct,
    ( SELECT min(s.due_date) AS min
           FROM case_schedule_items s
          WHERE s.case_id = f.case_id AND s.status = 'pending'::text) AS next_due_date,
    ( SELECT count(*) AS count
           FROM case_schedule_items s
          WHERE s.case_id = f.case_id AND s.status = 'pending'::text AND s.due_date < CURRENT_DATE) AS overdue_count,
    ( SELECT count(*) AS count
           FROM case_data_completeness dc
          WHERE dc.case_id = f.case_id AND dc.status = 'pending'::text) AS pending_fields
   FROM flags f;

create or replace view public.v_dashboard_stats as
 SELECT ( SELECT count(*) AS count
           FROM cases) AS total_cases,
    ( SELECT count(*) AS count
           FROM cases
          WHERE cases.data_source = 'normal'::text) AS normal_cases,
    ( SELECT count(*) AS count
           FROM cases
          WHERE cases.data_source = 'legacy_import'::text) AS legacy_cases,
    ( SELECT count(*) AS count
           FROM cases
          WHERE cases.consent_signed_at IS NOT NULL) AS consent_signed,
    ( SELECT count(*) AS count
           FROM cases
          WHERE COALESCE(cases.line_bound, false)) AS line_bound,
    ( SELECT count(*) AS count
           FROM cases
          WHERE cases.recurrence_status = 'recurred'::text) AS recurred_cases,
    ( SELECT count(*) AS count
           FROM cases
          WHERE cases.recurrence_status IS NOT NULL AND cases.recurrence_status <> 'unknown'::text) AS recurrence_known,
    ( SELECT count(*) AS count
           FROM cases
          WHERE cases.enrollment_year = EXTRACT(year FROM CURRENT_DATE)::integer) AS enrolled_this_year,
    ( SELECT count(*) AS count
           FROM case_schedule_items
          WHERE case_schedule_items.status = 'pending'::text) AS pending_items,
    ( SELECT count(*) AS count
           FROM case_schedule_items
          WHERE case_schedule_items.status = 'pending'::text AND case_schedule_items.due_date < CURRENT_DATE) AS overdue_items,
    ( SELECT COALESCE(round(avg(v_case_pipeline_progress.progress_pct)), 0::numeric) AS "coalesce"
           FROM v_case_pipeline_progress) AS avg_pipeline_pct;


-- ---- Row Level Security ----
-- ⚠️ 目前的政策是 demo 期的刻意取捨：對 anon 全開，存取控制靠應用層（共用密碼＋操作者選單）。
-- 正式上線請務必接著跑 03_lockdown_anon.sql，把 anon 的權限收回、改用 service_role。
alter table public.app_settings enable row level security;
alter table public.audit_log enable row level security;
alter table public.biobank_checklist_items enable row level security;
alter table public.biobank_samples enable row level security;
alter table public.body_part_zones enable row level security;
alter table public.body_site_masks enable row level security;
alter table public.case_data_completeness enable row level security;
alter table public.case_diagnoses enable row level security;
alter table public.case_intake_followups enable row level security;
alter table public.case_intake_option_lists enable row level security;
alter table public.case_intake_option_record_items enable row level security;
alter table public.case_intake_option_records enable row level security;
alter table public.case_keloid_lesions enable row level security;
alter table public.case_patient_intake_progress enable row level security;
alter table public.case_schedule_items enable row level security;
alter table public.case_term_record_items enable row level security;
alter table public.case_term_records enable row level security;
alter table public.cases enable row level security;
alter table public.control_subjects enable row level security;
alter table public.doctors enable row level security;
alter table public.health_education_kb enable row level security;
alter table public.icd_codes enable row level security;
alter table public.import_mapping_templates enable row level security;
alter table public.lab_marker_definitions enable row level security;
alter table public.lab_results enable row level security;
alter table public.legacy_import_batches enable row level security;
alter table public.legacy_import_rows enable row level security;
alter table public.line_bot_error_log enable row level security;
alter table public.line_message_templates enable row level security;
alter table public.line_reminder_log enable row level security;
alter table public.operators enable row level security;
alter table public.photos enable row level security;
alter table public.questionnaire_answers enable row level security;
alter table public.questionnaire_questions enable row level security;
alter table public.questionnaire_responses enable row level security;
alter table public.questionnaire_templates enable row level security;
alter table public.radiotherapy_doctors enable row level security;
alter table public.radiotherapy_dose_protocols enable row level security;
alter table public.radiotherapy_sessions enable row level security;
alter table public.schedule_template_items enable row level security;
alter table public.schedule_templates enable row level security;
alter table public.term_library enable row level security;
alter table public.treatment_presets enable row level security;
alter table public.treatment_records enable row level security;
alter table public.treatment_types enable row level security;

drop policy if exists app_settings_all on public.app_settings;
create policy app_settings_all on public.app_settings as permissive for all to anon, authenticated using (true) with check (true);

drop policy if exists anon_full_access on public.audit_log;
create policy anon_full_access on public.audit_log as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.biobank_checklist_items;
create policy anon_full_access on public.biobank_checklist_items as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.biobank_samples;
create policy anon_full_access on public.biobank_samples as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.body_part_zones;
create policy anon_full_access on public.body_part_zones as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.body_site_masks;
create policy anon_full_access on public.body_site_masks as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.case_data_completeness;
create policy anon_full_access on public.case_data_completeness as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.case_diagnoses;
create policy anon_full_access on public.case_diagnoses as permissive for all to anon using (true) with check (true);

drop policy if exists anon_all on public.case_intake_followups;
create policy anon_all on public.case_intake_followups as permissive for all to anon, authenticated using (true) with check (true);

drop policy if exists anon_full_access on public.case_intake_option_lists;
create policy anon_full_access on public.case_intake_option_lists as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.case_intake_option_record_items;
create policy anon_full_access on public.case_intake_option_record_items as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.case_intake_option_records;
create policy anon_full_access on public.case_intake_option_records as permissive for all to anon using (true) with check (true);

drop policy if exists "anon full access" on public.case_keloid_lesions;
create policy "anon full access" on public.case_keloid_lesions as permissive for all to anon using (true) with check (true);

drop policy if exists anon_all on public.case_patient_intake_progress;
create policy anon_all on public.case_patient_intake_progress as permissive for all to anon, authenticated using (true) with check (true);

drop policy if exists anon_full_access on public.case_schedule_items;
create policy anon_full_access on public.case_schedule_items as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.case_term_record_items;
create policy anon_full_access on public.case_term_record_items as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.case_term_records;
create policy anon_full_access on public.case_term_records as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.cases;
create policy anon_full_access on public.cases as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.control_subjects;
create policy anon_full_access on public.control_subjects as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.doctors;
create policy anon_full_access on public.doctors as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.health_education_kb;
create policy anon_full_access on public.health_education_kb as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.icd_codes;
create policy anon_full_access on public.icd_codes as permissive for all to anon using (true) with check (true);

drop policy if exists "anon full access" on public.import_mapping_templates;
create policy "anon full access" on public.import_mapping_templates as permissive for all to anon using (true) with check (true);

drop policy if exists "anon full access" on public.lab_marker_definitions;
create policy "anon full access" on public.lab_marker_definitions as permissive for all to anon using (true) with check (true);

drop policy if exists "anon full access" on public.lab_results;
create policy "anon full access" on public.lab_results as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.legacy_import_batches;
create policy anon_full_access on public.legacy_import_batches as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.legacy_import_rows;
create policy anon_full_access on public.legacy_import_rows as permissive for all to anon using (true) with check (true);

drop policy if exists "anon full access" on public.line_bot_error_log;
create policy "anon full access" on public.line_bot_error_log as permissive for all to anon using (true) with check (true);

drop policy if exists "anon full access" on public.line_message_templates;
create policy "anon full access" on public.line_message_templates as permissive for all to anon using (true) with check (true);

drop policy if exists "anon full access" on public.line_reminder_log;
create policy "anon full access" on public.line_reminder_log as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.operators;
create policy anon_full_access on public.operators as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.photos;
create policy anon_full_access on public.photos as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.questionnaire_answers;
create policy anon_full_access on public.questionnaire_answers as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.questionnaire_questions;
create policy anon_full_access on public.questionnaire_questions as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.questionnaire_responses;
create policy anon_full_access on public.questionnaire_responses as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.questionnaire_templates;
create policy anon_full_access on public.questionnaire_templates as permissive for all to anon using (true) with check (true);

drop policy if exists "anon full access" on public.radiotherapy_doctors;
create policy "anon full access" on public.radiotherapy_doctors as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.radiotherapy_dose_protocols;
create policy anon_full_access on public.radiotherapy_dose_protocols as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.radiotherapy_sessions;
create policy anon_full_access on public.radiotherapy_sessions as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.schedule_template_items;
create policy anon_full_access on public.schedule_template_items as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.schedule_templates;
create policy anon_full_access on public.schedule_templates as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.term_library;
create policy anon_full_access on public.term_library as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.treatment_presets;
create policy anon_full_access on public.treatment_presets as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.treatment_records;
create policy anon_full_access on public.treatment_records as permissive for all to anon using (true) with check (true);

drop policy if exists anon_full_access on public.treatment_types;
create policy anon_full_access on public.treatment_types as permissive for all to anon using (true) with check (true);
