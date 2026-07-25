-- English data dictionary: table and column comments for the whole public schema.

comment on table public.operators is 'Selectable operators under the shared team account; chosen before each action for audit attribution (decision #9).';
comment on column public.operators.role is 'Free-text role label (assistant / nurse practitioner / PI / admin).';

comment on table public.doctors is 'Attending physicians; their code is used in the research ID (decision #8).';
comment on column public.doctors.code is 'Short physician code used as the research-ID prefix (e.g. CHN).';

comment on table public.icd_codes is 'Curated shortlist of keloid-related ICD-9/ICD-10 diagnosis codes (decision #11).';
comment on column public.icd_codes.system is 'Coding system: ICD9 or ICD10.';
comment on column public.icd_codes.description_full is 'Full diagnosis text shown alongside the code.';

comment on table public.cases is 'De-identified research case. Cloud stores only research-ID-related data; patient name and medical-record number are never stored here (decision #1).';
comment on column public.cases.research_id is 'Research identifier in the form [doctorCode]-[year]-[sequence] (decision #8).';
comment on column public.cases.enrollment_year is 'Enrollment year; sequence numbers reset each year per doctor code.';
comment on column public.cases.sequence_no is 'Per doctor-code / per year running sequence number.';
comment on column public.cases.phone_number is 'Patient mobile number (the only direct contact detail stored in the cloud).';
comment on column public.cases.line_bound is 'Whether the patient has completed LINE account binding.';
comment on column public.cases.line_bind_code is 'One-time code the patient enters in LINE to complete binding.';
comment on column public.cases.consent_signed_at is 'Date the paper informed-consent form was signed (status record only; decision #10).';
comment on column public.cases.consent_confirmed_by is 'Operator who confirmed the signed consent form.';
comment on column public.cases.data_source is 'Origin of the record: normal (live enrollment) or legacy_import (back-filled from old data).';
comment on column public.cases.body_site is 'Primary keloid body site for the case.';
comment on column public.cases.sex is 'Biological sex (M/F/other/unknown). Legacy field 性別.';
comment on column public.cases.age_at_enrollment is 'Patient age at enrollment. Legacy field 年齡.';
comment on column public.cases.keloid_history is 'Free-text keloid clinical history. Legacy field "keloid history".';
comment on column public.cases.keloid_size is 'Free-text keloid size / measurements. Legacy field "keloid 大小".';
comment on column public.cases.family_history is 'Family history of keloid. Legacy field "Family".';
comment on column public.cases.jsw_score is 'JSW (Japan Scar Workshop) scar scale score, if recorded. Legacy field "JSW score".';
comment on column public.cases.recurrence_status is 'Recurrence outcome: none / recurred / unknown / not_applicable. Legacy field 是否復發.';
comment on column public.cases.recurrence_date is 'Date recurrence was observed, if any. Legacy field 復發日期.';
comment on column public.cases.days_to_recurrence is 'Days from treatment to recurrence. Legacy field 治療後復發天數.';
comment on column public.cases.followup_cutoff_date is 'Statistical follow-up cutoff date used for outcome analysis. Legacy field 統計截止日.';
comment on column public.cases.over_one_year_flag is 'Whether follow-up has passed one year since treatment. Legacy field 距離治療後超過1年.';
comment on column public.cases.notes is 'Free-text case notes.';

comment on table public.case_diagnoses is 'Diagnoses attached to a case; supports a primary diagnosis plus comorbidities.';
comment on column public.case_diagnoses.is_primary is 'True for the primary diagnosis of the case.';

comment on table public.term_library is 'Maintainable medical-term library, split into pre / intra / post-op lists, each term optionally with an illustration (decision #5).';
comment on column public.term_library.stage is 'Surgical stage the term belongs to: pre / intra / post.';
comment on column public.term_library.image_url is 'Optional illustration image for the term.';

comment on table public.case_term_records is 'A recorded selection of medical terms for a case at a given stage.';
comment on table public.case_term_record_items is 'Individual terms selected within a case_term_records entry (multi-select).';

comment on table public.treatment_types is 'Treatment categories; each defines a structured field schema. Includes intralesional injection, pressure garment, surgical excision, radiotherapy, and other (decision #6).';
comment on column public.treatment_types.field_schema is 'JSON array describing the structured input fields for this treatment type.';

comment on table public.treatment_presets is 'Reusable field-value presets ("templates") for a treatment type (decision #6).';
comment on table public.treatment_records is 'A treatment event for a case, holding structured field_values plus optional free text.';
comment on column public.treatment_records.field_values is 'Structured values keyed by the treatment type field schema.';

comment on table public.questionnaire_templates is 'Questionnaire definitions produced by the generic questionnaire engine (scar scales, lifestyle surveys, etc.; decision #4).';
comment on column public.questionnaire_templates.category is 'Questionnaire category: scale / lifestyle / other.';
comment on table public.questionnaire_questions is 'Questions belonging to a questionnaire template.';
comment on column public.questionnaire_questions.question_type is 'Answer type: single / multi / number / text / scale.';
comment on table public.questionnaire_responses is 'A submitted questionnaire response for a case.';
comment on column public.questionnaire_responses.submitted_via is 'Submission channel: line_sim (simulated patient side) or staff (entered in clinic).';
comment on table public.questionnaire_answers is 'Individual answers within a questionnaire response.';

comment on table public.schedule_templates is 'Follow-up schedule templates applied when a case is created (decision #7).';
comment on table public.schedule_template_items is 'Time points within a schedule template, with offset days and attached actions.';
comment on column public.schedule_template_items.offset_days is 'Days after the anchor date at which this time point is due.';
comment on column public.schedule_template_items.actions is 'JSON array of actions due at this time point (e.g. questionnaire, photo).';

comment on table public.case_schedule_items is 'Concrete follow-up schedule items for a case, instantiated from a template and individually adjustable.';
comment on column public.case_schedule_items.status is 'Item status: pending / done / skipped.';
comment on column public.case_schedule_items.note is 'Free-text note for this follow-up visit. Legacy field 紀錄.';

comment on table public.body_site_masks is 'Photo alignment masks per body site (generic or custom outline).';
comment on table public.photos is 'Wound photos: timestamp + research ID + follow-up time point only; no automated image analysis in phase 1 (decision #3).';
comment on column public.photos.uploaded_via is 'Upload channel: line_sim (simulated patient side) or staff.';

comment on table public.legacy_import_batches is 'One upload of de-identified legacy data; tracks column mapping and commit status (decision #13).';
comment on column public.legacy_import_batches.column_mapping is 'JSON mapping of legacy column names to target system fields (reusable as a template).';
comment on column public.legacy_import_batches.status is 'Batch lifecycle: staged / reviewed / committed.';
comment on table public.legacy_import_rows is 'Staged legacy rows pending review before being committed into real tables.';
comment on column public.legacy_import_rows.validation_errors is 'JSON list of validation issues detected for the row.';
comment on column public.legacy_import_rows.status is 'Row lifecycle: pending / committed / rejected.';

comment on table public.case_data_completeness is 'Per-case data-completeness checklist for back-filled records (decision #13).';
comment on column public.case_data_completeness.status is 'Field completeness: has_value / pending (to be filled later) / not_applicable (concept did not exist pre-launch).';

comment on table public.biobank_samples is 'Biobank / specimen tracking for a case (paraffin block, tissue bank, primary culture, cryotube location). Legacy biobank columns.';
comment on column public.biobank_samples.paraffin_block_no is 'Paraffin block number. Legacy field 蠟塊編號.';
comment on column public.biobank_samples.tissue_bank_status is 'Tissue-bank status / entry note. Legacy field 組織庫.';
comment on column public.biobank_samples.primary_culture is 'Primary culture status / note. Legacy field "Primary culture".';
comment on column public.biobank_samples.cryotube_location is 'Cryotube storage location. Legacy field 細胞凍管位置.';

comment on table public.audit_log is 'Append-only audit trail of operator actions.';
comment on column public.audit_log.operator_name is 'Name of the operator selected at the time of the action.';
