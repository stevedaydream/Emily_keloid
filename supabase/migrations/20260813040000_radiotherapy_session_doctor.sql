-- 2026-08-13：逐次放療待辦也要能記錄放射科醫師。
--
-- 先前只有「放射治療」治療紀錄（treatment_records.field_values.rt_doctor）能填醫師，
-- 但手術後自動產生的那組逐次待辦（radiotherapy_sessions）沒有欄位——
-- 而那才是實際執行時真正會用到的路徑（每次做完在個案頁標記完成）。
--
-- 逐次而非整個療程存一次：同一組療程的不同次可能由不同醫師執行。
-- 醫師名單沿用 treatment_types('放射治療').field_schema 的 rt_doctor 選項（後台可維護），
-- 這裡只存姓名文字，匯出時再對照回部長碼表的 1-7。
alter table public.radiotherapy_sessions add column if not exists rt_doctor text;
comment on column public.radiotherapy_sessions.rt_doctor is
  '這一次放療的執行醫師（姓名）。選項來自 treatment_types(''放射治療'').field_schema 的 rt_doctor；匯出時對照回部長碼表的 1-7。';
