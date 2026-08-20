-- 2026-08-20：登入時「請選擇目前操作者」的排列順序要能自己決定。
--
-- 原本是照 name 排（中文字按 Unicode 碼位，等於隨機），但這份清單是每天每個人
-- 進系統的第一個畫面，最常被點的應該排最上面：診間護理師 > 研究助理 > 試驗主持人 > 系統管理者。
-- 與後台其他可維護清單（intake_options、lab_markers…）一致，用 sort_order 小的在前。

alter table public.operators
  add column if not exists sort_order int not null default 100;

comment on column public.operators.sort_order is
  'Order in the operator picker (ascending, ties broken by name). Lowest = shown first; put the most frequently used role at the top.';
