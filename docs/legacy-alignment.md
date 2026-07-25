# Legacy Excel → Supabase alignment

Mapping of the legacy workbook `20230912_keloid_table12.xlsm`
(sheet `raw data`, 72 cases × 135 columns) onto the Supabase schema.
Per architecture decision #1 the cloud never stores **name (受試者)** or
**medical-record number (病歷號)** — those stay in the clinic-local lookup tool.

## Basic info

| Legacy column | Target | Notes |
|---|---|---|
| 編號 | `cases.sequence_no` (via research_id) | Re-issued as `[doctorCode]-[year]-[seq]` at import |
| 受試者 (name) | — | **Not stored** (de-identified) |
| 病歷號 (chart no.) | — | **Not stored** (de-identified) |
| 性別 | `cases.sex` | Map 男→M, 女→F |
| 年齡 | `cases.age_at_enrollment` | |
| 手機 | `cases.phone_number` | |
| 主治醫師 | `cases.doctor_id` | Resolve name → doctor code |
| 部位 | `cases.body_site` | |
| 受試者同意書 | `cases.consent_signed_at` / `consent_confirmed_by` | |
| keloid history | `cases.keloid_history` | |
| keloid 大小 | `cases.keloid_size` | |
| Family | `cases.family_history` | |
| JSW score | `cases.jsw_score` | |

## Biobank → `biobank_samples`

| Legacy column | Target |
|---|---|
| 蠟塊編號 | `paraffin_block_no` |
| 組織庫 | `tissue_bank_status` |
| Primary culture | `primary_culture` |
| 細胞凍管位置 | `cryotube_location` |

## OP / RT → `treatment_records` (existing module)

- OP block (開刀日 / Operation 1·2 / 部位1–4) → treatment type **手術切除** (`method`, `adjuvant`).
- RT block (Radiation date / Total Dose / Fractions / bolus / electron beam /
  Treatment Response / Acute Reactions) → new treatment type **放射治療** with a
  matching `field_schema`.

## Outcome → `cases`

| Legacy column | Target |
|---|---|
| 是否復發 | `recurrence_status` (none / recurred / unknown / not_applicable) |
| 復發日期 | `recurrence_date` |
| 治療後復發天數 | `days_to_recurrence` |
| 統計截止日 | `followup_cutoff_date` |
| 距離治療後超過1年 | `over_one_year_flag` |

## Follow-up visits → `case_schedule_items`

Each repeating `追蹤時間 / 頻率 / 紀錄` triple becomes a schedule item
(`due_date`, plus the free-text note in the new `case_schedule_items.note` column).

## Dashboard & pipeline

- `v_case_pipeline_progress` — per-case 8-stage 收案一條龍 progress (`progress_pct`,
  `next_due_date`, `overdue_count`, `pending_fields`).
- `v_dashboard_stats` — single-row KPI summary.
- Rendered at `/dashboard` (KPIs, pipeline board, cohort breakdowns) and as a
  per-case stepper on the case detail page.

## Follow-up work (not in this change)

- Extend the import commit action (`src/app/admin/import/actions.ts`) to write the
  new `cases` columns and seed `biobank_samples` from mapped rows.
- Add recurrence / biobank rows to the `case_data_completeness` seed for imported cases.
