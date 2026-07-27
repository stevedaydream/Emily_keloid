-- keloid_history 改用可維護清單勾選＋一律顯示的詳細內容欄位（部位/時間/治療），
-- 沿用 case_intake_option_lists/records 機制，新增 category='keloid_history_type'。
alter table case_intake_option_lists drop constraint case_intake_option_lists_category_check;
alter table case_intake_option_lists add constraint case_intake_option_lists_category_check
  check (category = any (array['onset_cause', 'referral_source', 'diet_education', 'exercise_restriction', 'family_disease', 'keloid_history_type']));

insert into case_intake_option_lists (category, label, sort_order) values
  ('keloid_history_type', '初次發生', 1),
  ('keloid_history_type', '手術後復發', 2),
  ('keloid_history_type', '藥物治療後復發', 3),
  ('keloid_history_type', '多處復發', 4),
  ('keloid_history_type', '自然穩定無變化', 5),
  ('keloid_history_type', '其他', 99)
on conflict do nothing;

-- keloid 大小改為可複數登打的病灶測量紀錄（現存病灶，可能不只一處），取代單一自由文字欄位。
create table if not exists case_keloid_lesions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  body_site text not null,
  length_cm numeric,
  width_cm numeric,
  height_cm numeric,
  note text,
  created_at timestamptz not null default now()
);

comment on table case_keloid_lesions is '個案現存蟹足腫病灶的部位與長寬高測量，一個個案可有多筆（多處病灶）。取代舊版 cases.keloid_size 單一自由文字欄位；舊欄位保留供舊資料對齊/匯出使用。';

alter table case_keloid_lesions enable row level security;
create policy "anon full access" on case_keloid_lesions for all to anon using (true) with check (true);
