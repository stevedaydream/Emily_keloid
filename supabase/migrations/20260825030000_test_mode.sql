-- 測試模式（使用者要求 2026-08-25）。
--
-- 起因：demo 期間收的全是測試個案，要清掉只能整張表 delete——而那會連同「正在操作的那一筆」
-- 一起消失（實際發生過：清空後使用者手上的分頁再送出治療紀錄就外鍵失敗）。
-- 有了標籤就能只刪測試資料，也能讓匯出檔預設不要混進測試列。
--
-- 兩個東西：
--   1. cases.is_test —— 建檔當下蓋章。之後把開關關掉，舊的測試個案仍然是測試個案
--      （狀態屬於那一筆資料，不是屬於當下的開關）。
--   2. app_settings —— 全域的鍵值設定表。開關要讓所有裝置同步生效，所以不能放 localStorage。

alter table public.cases
  add column if not exists is_test boolean not null default false;

comment on column public.cases.is_test is
  '建檔當下測試模式是否開啟。測試個案預設不進匯出檔，後台可一鍵刪除。';

-- 已存在的個案一律視為正式資料（demo 期間的測試資料在此之前已由使用者要求清空）。

create index if not exists cases_is_test_idx on public.cases (is_test) where is_test;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table public.app_settings is
  '全域的鍵值設定（目前只有 test_mode）。放資料庫而不是瀏覽器，是因為開關要讓所有裝置同步生效。';

alter table public.app_settings enable row level security;

-- 比照其他應用資料表：demo 階段存取控制在應用層（見 project.md 安全性備忘）
drop policy if exists app_settings_all on public.app_settings;
create policy app_settings_all on public.app_settings for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.app_settings to anon, authenticated;

insert into public.app_settings (key, value, updated_by)
values ('test_mode', 'false'::jsonb, 'migration')
on conflict (key) do nothing;
