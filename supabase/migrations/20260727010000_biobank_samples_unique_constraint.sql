-- 加上 case_id 唯一約束，讓「病人基本資料補充」表單可以用 upsert 簡單編輯單一列
-- （原本這張表是舊資料匯入用，沒有基數限制；2026-07-27 補上手動編輯介面後需要）。
alter table public.biobank_samples add constraint biobank_samples_case_id_unique unique (case_id);
comment on constraint biobank_samples_case_id_unique on public.biobank_samples is 'One legacy-style biobank record per case for the manual edit form (2026-07-27); earlier this table had no cardinality constraint.';
