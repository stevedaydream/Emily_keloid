-- ICD-9 ↔ ICD-10 雙向對照（依使用者提供的長庚(CGH)院內對照表建立）：
--   ICD-9 (CGH)                                  ICD-10 (CGH)
--   7061  Acne keloid                            L730  Acne keloid
--   7014  Hypertrophic scar                      L910  Hypertrophic scar
--   7092  Scar conditions and fibrosis of skin   L905  Scar conditions and fibrosis of skin
--
-- 對照關係用共用的 mapping_key 表示（而不是自我外鍵），這樣點任一邊都能查到另一邊，
-- 也能容納未來 1 對多的對應；沒有對照的碼（例如共病參考用的 I10、E11.9）留 null。
alter table public.icd_codes add column if not exists mapping_key text;
comment on column public.icd_codes.mapping_key is
  'Shared key linking an ICD-9 row and its ICD-10 counterpart (both rows carry the same value). Null when the code has no cross-system counterpart in this shortlist.';
create index if not exists idx_icd_codes_mapping_key on public.icd_codes(mapping_key);

-- 既有的三筆碼改成院內對照表的寫法（代碼不含小數點、診斷全文照對照表）。
-- 用 update 而非「刪掉重建」，是為了保留 case_diagnoses 既有引用（已有 8 筆診斷紀錄指向這些碼）。
update public.icd_codes
set code = '7014', description_full = 'Hypertrophic scar', mapping_key = 'hypertrophic_scar'
where system = 'ICD9' and code in ('701.4', '7014');

update public.icd_codes
set code = 'L910', description_full = 'Hypertrophic scar', mapping_key = 'hypertrophic_scar'
where system = 'ICD10' and code in ('L91.0', 'L910');

update public.icd_codes
set code = 'L905', description_full = 'Scar conditions and fibrosis of skin', mapping_key = 'scar_fibrosis'
where system = 'ICD10' and code in ('L90.5', 'L905');

-- 補齊對照表其餘四筆
insert into public.icd_codes (code, system, description_full, mapping_key)
select v.code, v.system, v.description_full, v.mapping_key
from (values
  ('7061', 'ICD9',  'Acne keloid',                          'acne_keloid'),
  ('L730', 'ICD10', 'Acne keloid',                          'acne_keloid'),
  ('7092', 'ICD9',  'Scar conditions and fibrosis of skin',  'scar_fibrosis')
) as v(code, system, description_full, mapping_key)
where not exists (
  select 1 from public.icd_codes e where e.system = v.system and e.code = v.code
);
