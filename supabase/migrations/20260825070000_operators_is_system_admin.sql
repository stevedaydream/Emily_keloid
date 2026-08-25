-- 「這位操作者是系統管理者嗎」（使用者要求 2026-08-25）。
--
-- 用途：測試模式那類「維運工具」不該出現在試驗主持人的畫面上——部長看到一顆
-- 「刪除所有測試個案」只會困惑，而那顆按鈕跟他的工作完全無關。
--
-- ⚠️ 這**還不是權限**（決策 #9：全體共用同一組帳號、不分角色權限）。目前它只控制
-- 「入口顯示不顯示」，知道網址的人仍然進得去。真正的門是之後要加的 PIN（見 pending.md）。
-- 欄位取名 is_system_admin 而不是 can_xxx，就是為了不假裝它是權限。

alter table public.operators
  add column if not exists is_system_admin boolean not null default false;

comment on column public.operators.is_system_admin is
  '是否為系統管理者：控制維運工具（測試模式等）的入口是否顯示。目前不是權限控制，僅為動線。';

update public.operators set is_system_admin = true where name = '系統管理者';
