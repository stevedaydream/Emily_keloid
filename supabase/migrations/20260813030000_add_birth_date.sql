-- 2026-08-13：新增出生日期（對應新格式 Basic Info. 的 birthday 欄）。
--
-- ⚠️ 這改變了決策 #1 的去識別化姿態：雲端原本刻意只存 age_at_enrollment（年齡）而不存出生日期，
-- 因為「出生日期＋性別＋部位」是典型的可再識別組合。2026-08-13 使用者在被提醒此風險後決定加入，
-- 已於 project.md「安全性備忘」註記，Phase 1 送 IRB 時應一併說明。
--
-- age_at_enrollment 保留不動（仍是 Age 欄的來源）：它是「收案當下的年齡」，
-- 與出生日期不是同一件事，兩者並存不衝突。
alter table public.cases add column if not exists birth_date date;
comment on column public.cases.birth_date is
  '出生日期。對應新格式 Basic Info. 的 birthday。⚠️ 與性別/部位組合具再識別風險（決策 #1 的例外，2026-08-13 使用者決定加入）。age_at_enrollment 仍獨立保留，代表收案當下年齡。';
