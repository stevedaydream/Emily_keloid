-- 2026-08-13：補齊「欄位缺口清單」裡可以做的項目。
--   ① height / weight / BMI：cases 新增身高體重欄位（BMI 由匯出自動計算，不另存以免不同步）
--   ② Medical_history_self / Fmaily_history / Keloid_family_history：給選項代碼，匯出由文字反推
--   ③ surgical procedure：手術切除的 field_schema 新增術式 select
--
-- 仍留在缺口清單：birthday（涉及去識別化，需先決策）、
-- KC_1..5 與 KOST_1..5（要拆到「每個病灶各自」，取決於 pending.md D5 助理的回覆）。

alter table public.cases add column if not exists height_cm numeric;
alter table public.cases add column if not exists weight_kg numeric;
comment on column public.cases.height_cm is '身高（公分）。對應新格式 Basic Info. 的 height；無紀錄時匯出 9999。';
comment on column public.cases.weight_kg is '體重（公斤）。對應新格式的 weight；BMI 由匯出時以 weight/(height/100)^2 計算，不另存欄位以免兩者不同步。';

-- 家族史沿用既有的 family_disease 清單（8 項剛好對上部長碼表）。
-- 注意「其他」的 sort_order 是 99，不能直接把 sort_order 當代碼用——要明確設成 8。
update public.case_intake_option_lists set export_code = sort_order
where category = 'family_disease' and export_code is null and sort_order <= 8;
update public.case_intake_option_lists set export_code = 8
where category = 'family_disease' and label = '其他';

alter table public.case_intake_option_lists drop constraint if exists case_intake_option_lists_category_check;
alter table public.case_intake_option_lists add constraint case_intake_option_lists_category_check
  check (category = any (array[
    'onset_cause', 'referral_source', 'diet_education', 'exercise_restriction',
    'family_disease', 'keloid_history_type', 'keloid_symptom', 'symptom_change',
    'visit_reason', 'self_disease'
  ]));
alter table public.case_intake_option_records drop constraint if exists case_intake_option_records_category_check;
alter table public.case_intake_option_records add constraint case_intake_option_records_category_check
  check (category = any (array[
    'onset_cause', 'referral_source', 'diet_education', 'exercise_restriction',
    'family_disease', 'keloid_history_type', 'keloid_symptom', 'symptom_change',
    'visit_reason', 'self_disease'
  ]));

-- 自身病史另開一份：部長碼表第 7 項在「自身病史」是「蟹足腫或肥厚性疤痕」、
-- 在「家族史」是「肥厚性疤痕」，兩份各自維護才不會互相干擾。
insert into public.case_intake_option_lists (category, label, sort_order, export_code) values
  ('self_disease', '高血壓', 1, 1), ('self_disease', '糖尿病', 2, 2),
  ('self_disease', '心臟病', 3, 3), ('self_disease', '腦中風', 4, 4),
  ('self_disease', '癌症', 5, 5),   ('self_disease', '氣喘／過敏性疾病', 6, 6),
  ('self_disease', '蟹足腫或肥厚性疤痕', 7, 7), ('self_disease', '其他', 8, 8)
on conflict do nothing;

-- 術式：原本 method 是自由文字，無法對到部長碼表的 1-4。改為 select 並保留原 key，
-- 舊資料的文字值仍在 field_values.method 裡（匯出時不分大小寫比對，對不到就留空）。
update public.treatment_types
set field_schema = '[
  {"key":"method","type":"select","label":"術式","options":[
    {"value":"Excision","export_code":1},
    {"value":"Z-plasty","export_code":2},
    {"value":"Scar revision","export_code":3},
    {"value":"Wedge excision","export_code":4}
  ]},
  {"key":"adjuvant","type":"text","label":"輔助治療（如放療）"}
]'::jsonb
where name = '手術切除';
