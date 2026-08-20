-- 2026-08-20：研究助理的落點改成「批次編輯」。
--
-- 20260820020000 開了四個落點（今日門診／收案／儀表板／後台管理），當時把研究助理放在後台管理，
-- 理由是他每天要用批次匯入。實際使用後改為批次編輯——匯入是階段性的（上線初期把舊病人補完），
-- 批次補空欄位才是每天在做的事。後台管理仍在導覽列上，只是不當落點。

alter table public.operators drop constraint if exists operators_landing_mode_check;

alter table public.operators
  add constraint operators_landing_mode_check
  check (landing_mode in ('clinic_today', 'intake', 'batch_edit', 'dashboard', 'admin'));

comment on column public.operators.landing_mode is
  'Where this operator lands after picking their identity: clinic_today = /clinic-today, intake = /intake, batch_edit = /batch-edit, dashboard = /, admin = /admin. A default landing only, NOT access control.';
