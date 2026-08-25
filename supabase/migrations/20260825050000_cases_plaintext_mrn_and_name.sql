-- 2026-08-25：廢除「病歷號對照表／加密保管庫」，病歷號與姓名改為明文存雲端。
--
-- 這是使用者在實測多次失敗後的明確決策：對照表要在每台裝置各自維護（本機 CSV）、
-- 或靠零知識保管庫同步，實務上一直出問題（裝置宣稱支援檔案 API 卻寫不進去、
-- 保管庫沒建立就靜默降級、重複收案擋不住…），診間無法做事。
--
-- **這推翻了決策 #1**（雲端只存研究編號相關資料、完全不觸碰病歷號）。
-- 取而代之的保護是「匯出時才需要金鑰」——見 app_settings 的 export_identified_key_*。
-- 要清楚知道：這道保護擋的是**匯出檔**，不是資料庫本身；資料庫裡就是明文。
-- Phase 1 送 IRB 必須據實說明（見 project.md 安全性備忘）。

alter table public.cases
  add column if not exists mrn text,
  add column if not exists patient_name text;

comment on column public.cases.mrn is
  '病歷號（明文）。2026-08-25 起改存雲端以支援多裝置；匯出時需金鑰才會帶出這一欄。';
comment on column public.cases.patient_name is
  '病人姓名（明文）。同 mrn：2026-08-25 決策，匯出需金鑰。';

-- 一個病歷號就是一個人，一個人在這個研究裡只該有一筆個案（2026-08-20 的規則不變，
-- 只是從「瀏覽器端比對本機檔案」改成資料庫層真正擋得住）。
-- 空白不算重複（還沒填病歷號的個案可以有很多筆）。
create unique index if not exists cases_mrn_unique
  on public.cases (mrn)
  where mrn is not null and mrn <> '';

create index if not exists cases_patient_name_idx on public.cases (patient_name)
  where patient_name is not null;
