-- 2026-08-13：放射科醫師改成獨立的後台可維護清單（助理回覆 D9 選 A 案）。
--
-- 原本醫師名單塞在 treatment_types('放射治療').field_schema 的 rt_doctor 選項裡，
-- 但那份 schema 是「放射治療這種治療要填哪些欄位」的定義，
-- 名單本身跟著欄位定義走會有兩個問題：
--   1. 逐次放療待辦（radiotherapy_sessions）標記完成時也要選醫師，
--      得繞去讀另一種治療的 field_schema 才拿得到名單。
--   2. 匯入舊資料時要把代碼 1-7 反查回姓名，同樣得解析 JSON。
-- 拆成獨立表後三處（治療表單／逐次待辦／匯出匯入）讀同一份來源，不會各自漂移。
--
-- 注意：這份跟「醫師代碼清單」(doctors) 是兩份不同的東西——
-- 那份的代碼會編進研究編號（例 YEN-2026-001），這份只用於放療紀錄與匯出。
create table if not exists public.radiotherapy_doctors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  export_code integer,
  sort_order integer not null default 99,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.radiotherapy_doctors is
  '放射腫瘤科醫師清單（後台 /admin/rt-doctors 維護）。放療紀錄只存姓名文字快照，不設外鍵，所以這裡刪除不會破壞既有紀錄。';
comment on column public.radiotherapy_doctors.export_code is
  '收案格式 Operation 表 RT_Doctor 欄的代碼（1-7）。留空則該筆匯出時不帶代碼。';

alter table public.radiotherapy_doctors enable row level security;
drop policy if exists "anon full access" on public.radiotherapy_doctors;
create policy "anon full access" on public.radiotherapy_doctors for all using (true) with check (true);

-- 部長碼表的 1-7。
insert into public.radiotherapy_doctors (name, export_code, sort_order)
values
  ('吳錦榕', 1, 1),
  ('粘心華', 2, 2),
  ('蕭世禎', 3, 3),
  ('雷德',   4, 4),
  ('蔡有倫', 5, 5),
  ('王南宗', 6, 6),
  ('張瑞珊', 7, 7)
on conflict do nothing;

-- 名單已搬家，把 field_schema 裡的 rt_doctor 欄位拿掉，避免同時存在兩份可編輯的名單。
-- 既有 treatment_records.field_values 裡已填的 rt_doctor 值不動（仍是姓名文字，匯出照舊對照得到）。
update public.treatment_types
set field_schema = (
  select coalesce(jsonb_agg(f order by ord), '[]'::jsonb)
  from jsonb_array_elements(field_schema::jsonb) with ordinality as t(f, ord)
  where f->>'key' <> 'rt_doctor'
)
where name = '放射治療';

-- 20260813040000 當時的註解指向 field_schema，來源已改，一併更正。
comment on column public.radiotherapy_sessions.rt_doctor is
  '這一次放療的執行醫師（姓名）。選項來自 radiotherapy_doctors 表；匯出時對照回部長碼表的 1-7。';
