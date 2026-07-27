-- 治療紀錄目前只依賴個案層級的主要部位（cases.body_site / body_part_zone_id），
-- 同一個案在不同部位分開治療時無法區分是哪一筆治療對應哪個部位。
-- 新增每筆治療紀錄各自的部位文字欄位（沿用「現存病灶大小測量」已建立的部位命名，不建外鍵，允許自填新部位）。
alter table public.treatment_records add column if not exists body_site text;
comment on column public.treatment_records.body_site is 'Body site this specific treatment/follow-up record applies to (free text, independent of case-level primary body site).';
