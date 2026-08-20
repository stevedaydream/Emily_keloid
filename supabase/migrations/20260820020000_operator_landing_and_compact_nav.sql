-- 決策 2026-08-20（pending.md F-A）：部長不再收案，改由診間護理師與研究助理收案。
--
-- 這推翻了 20260729010000 的前提（「部長在門診連續收案」），該檔的
-- `role ilike '%部長%' → landing_mode='intake'` 已失效。
--
-- 兩件事：
-- 1) landing_mode 從「兩種工作模式」退化成純粹的「登入後落點」——導覽列不再依它分兩組
--    （AppHeader 合併成一張），所以值可以直接等於頁面。
-- 2) 導覽列的取捨改由新的 nav_compact 決定：診間護理師只要收案建檔、門診當下登打、遞平板，
--    其餘功能「收折保留」（收進「更多」，不是拿掉——沒有權限，藏掉只會讓人繞路）。

alter table public.operators
  add column if not exists nav_compact boolean not null default false;

comment on column public.operators.nav_compact is
  'Collapse non-core nav items behind a "more" disclosure for this operator. Core = new enrolment / today''s clinic / case list. A UI affordance, NOT access control — every page stays reachable.';

-- 舊值 intake/full 先搬到新值，再換 check constraint，順序不能顛倒。
alter table public.operators drop constraint if exists operators_landing_mode_check;

update public.operators set landing_mode = 'clinic_today' where landing_mode = 'intake';
update public.operators set landing_mode = 'dashboard'    where landing_mode = 'full';

alter table public.operators
  alter column landing_mode set default 'dashboard';

alter table public.operators
  add constraint operators_landing_mode_check
  check (landing_mode in ('clinic_today', 'intake', 'dashboard', 'admin'));

comment on column public.operators.landing_mode is
  'Where this operator lands after picking their identity: clinic_today = /clinic-today, intake = /intake, dashboard = /, admin = /admin. A default landing only, NOT access control. (2026-08-20: was intake|full, which also switched the nav bar; the nav is now a single shared bar plus the nav_compact flag.)';
