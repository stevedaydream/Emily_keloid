-- 2026-08-13：藥膏／貼片清單（新格式的 KOST 碼 1-12）。
--
-- 助理回覆 D5：「其他疤痕治療方式大多會一致」——同一個病人各處病灶用的藥膏貼片多半相同，
-- 所以記在個案層級即可，匯出時各病灶的 KOST_N 都填同一個值。
-- 另外新格式的 Year 1 在 FW1／FW2 各多了 KOST_FW 欄（前兩次回診當次用的），
-- 那個要逐次記錄，所以「藥膏」「貼片」兩種治療類型的 field_schema 也加上同一份選項。

alter table public.case_intake_option_lists drop constraint if exists case_intake_option_lists_category_check;
alter table public.case_intake_option_lists add constraint case_intake_option_lists_category_check
  check (category = any (array[
    'onset_cause', 'referral_source', 'diet_education', 'exercise_restriction',
    'family_disease', 'keloid_history_type', 'keloid_symptom', 'symptom_change',
    'visit_reason', 'self_disease', 'ointment_patch'
  ]));
alter table public.case_intake_option_records drop constraint if exists case_intake_option_records_category_check;
alter table public.case_intake_option_records add constraint case_intake_option_records_category_check
  check (category = any (array[
    'onset_cause', 'referral_source', 'diet_education', 'exercise_restriction',
    'family_disease', 'keloid_history_type', 'keloid_symptom', 'symptom_change',
    'visit_reason', 'self_disease', 'ointment_patch'
  ]));

insert into public.case_intake_option_lists (category, label, sort_order, export_code) values
  ('ointment_patch', '類固醇藥膏_可立舒',            1, 1),
  ('ointment_patch', '類固醇藥膏_妥膚淨',            2, 2),
  ('ointment_patch', '礙沙凝膠 Esarin Gel',          3, 3),
  ('ointment_patch', '類固醇藥膏_可立舒＋矽膚貼',    4, 4),
  ('ointment_patch', '類固醇藥膏_妥膚淨＋矽膚貼',    5, 5),
  ('ointment_patch', '新醫疤痕貼（矽膠片）',         6, 6),
  ('ointment_patch', '美皮豐疤痕貼（矽膠片）',       7, 7),
  ('ointment_patch', '小川令疤痕貼',                 8, 8),
  ('ointment_patch', '矽膚貼',                       9, 9),
  ('ointment_patch', '倍舒痕凝膠 Dermatix',         10, 10),
  ('ointment_patch', '優潔 Eurogel',                11, 11),
  ('ointment_patch', '其他',                        12, 12)
on conflict do nothing;

update public.treatment_types
set field_schema = '[
  {"key":"product","type":"select","label":"藥膏／貼片品項","options":[
    {"value":"類固醇藥膏_可立舒","export_code":1},
    {"value":"類固醇藥膏_妥膚淨","export_code":2},
    {"value":"礙沙凝膠 Esarin Gel","export_code":3},
    {"value":"類固醇藥膏_可立舒＋矽膚貼","export_code":4},
    {"value":"類固醇藥膏_妥膚淨＋矽膚貼","export_code":5},
    {"value":"新醫疤痕貼（矽膠片）","export_code":6},
    {"value":"美皮豐疤痕貼（矽膠片）","export_code":7},
    {"value":"小川令疤痕貼","export_code":8},
    {"value":"矽膚貼","export_code":9},
    {"value":"倍舒痕凝膠 Dermatix","export_code":10},
    {"value":"優潔 Eurogel","export_code":11},
    {"value":"其他","export_code":12}
  ]},
  {"key":"note","type":"text","label":"備註"}
]'::jsonb
where name in ('藥膏', '貼片');
