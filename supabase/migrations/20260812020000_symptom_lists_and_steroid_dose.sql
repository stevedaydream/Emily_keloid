-- 2026-08-12 docx 連動項（支撐部長新版 Excel 的三個編碼欄）
--   ① Keloid_symptom（碼 1-9）：目前不適症狀複選 → 新 category 'keloid_symptom'
--   ② FW_k_symptom（碼 1-6）：與治療前相比的症狀變化 → 新 category 'symptom_change'，
--      掛在每一筆 treatment_records 上（決策 2026-08-12，待助理確認見 pending.md D2）
--   ③ KSI（碼 40mg=1／10mg=2）：病灶內注射的類固醇劑量 → treatment_types.field_schema 新增 select 欄位
--
-- ⚠️ 新增 category 時，case_intake_option_lists 與 case_intake_option_records 兩張表的
--    CHECK constraint 都要改（2026-07-27 曾漏掉 records 那張，見 project.md 同日「更正」段）。

-- ===== ① / ② 兩張表的 category CHECK 同步放寬 =====
alter table public.case_intake_option_lists drop constraint if exists case_intake_option_lists_category_check;
alter table public.case_intake_option_lists add constraint case_intake_option_lists_category_check
  check (category = any (array[
    'onset_cause', 'referral_source', 'diet_education', 'exercise_restriction',
    'family_disease', 'keloid_history_type', 'keloid_symptom', 'symptom_change'
  ]));

alter table public.case_intake_option_records drop constraint if exists case_intake_option_records_category_check;
alter table public.case_intake_option_records add constraint case_intake_option_records_category_check
  check (category = any (array[
    'onset_cause', 'referral_source', 'diet_education', 'exercise_restriction',
    'family_disease', 'keloid_history_type', 'keloid_symptom', 'symptom_change'
  ]));

-- ===== ① 目前不適症狀（Keloid_symptom 碼 1-9）=====
-- docx 明訂：「無明顯不適」不可與其他選項同時勾選（互斥驗證在 IntakeOptionForm 前端 + action 後端）
insert into public.case_intake_option_lists (category, label, sort_order, export_code) values
  ('keloid_symptom', '無明顯不適',            1, 1),
  ('keloid_symptom', '搔癢',                  2, 2),
  ('keloid_symptom', '疼痛',                  3, 3),
  ('keloid_symptom', '灼熱感',                4, 4),
  ('keloid_symptom', '緊繃或拉扯感',          5, 5),
  ('keloid_symptom', '影響活動',              6, 6),
  ('keloid_symptom', '影響睡眠或日常生活',    7, 7),
  ('keloid_symptom', '因外觀造成困擾',        8, 8),
  ('keloid_symptom', '其他',                  9, 9)
on conflict do nothing;

-- ===== ② 症狀變化（FW_k_symptom 碼 1-6）=====
insert into public.case_intake_option_lists (category, label, sort_order, export_code) values
  ('symptom_change', '明顯改善',      1, 1),
  ('symptom_change', '稍微改善',      2, 2),
  ('symptom_change', '沒有明顯變化',  3, 3),
  ('symptom_change', '稍微加重',      4, 4),
  ('symptom_change', '明顯加重',      5, 5),
  ('symptom_change', '不清楚',        6, 6)
on conflict do nothing;

alter table public.treatment_records
  add column if not exists symptom_change_option_id uuid references public.case_intake_option_lists(id);
comment on column public.treatment_records.symptom_change_option_id is
  '這次回診時「與治療前相比症狀有何變化」的單選答案（case_intake_option_lists.category=''symptom_change''）。匯出 Year 1 的 FW_k_symptom 取手術後 365 天內最後一筆。';
create index if not exists idx_treatment_records_symptom_change on public.treatment_records(symptom_change_option_id);

-- ===== ③ 病灶內注射的類固醇劑量（KSI 碼 40mg=1／10mg=2）=====
-- field_schema 新增 type='select'，選項各自帶 export_code；前端 TreatmentForm 需支援 select 型別。
-- 「無=0」不需要選項：該病灶完全沒有注射紀錄時匯出就是 0。
update public.treatment_types
set field_schema = '[
  {"key":"drug","type":"text","label":"藥物名稱"},
  {"key":"steroid_dose","type":"select","label":"Triamcinolone acetonide 劑量","options":[{"value":"40mg","export_code":1},{"value":"10mg","export_code":2}]},
  {"key":"concentration","type":"text","label":"濃度"},
  {"key":"dose","type":"number","label":"劑量(ml)"},
  {"key":"site","type":"text","label":"注射部位"}
]'::jsonb
where name = '病灶內注射';
