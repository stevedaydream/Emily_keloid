-- 家族病史常見疾病選單（比照發生原因/得知看診等既有的可維護清單機制，同一張 case_intake_option_lists 表，
-- 只是多一個 category='family_disease'）。個案頁面「Family（家族史）」欄位用彈出視窗勾選，
-- 勾選結果組成文字寫回 cases.family_history，不另外建追蹤紀錄表（家族病史通常是一次性資訊，不像
-- 飲食衛教那樣需要記錄「每次追蹤各自的勾選」）。

alter table case_intake_option_lists drop constraint case_intake_option_lists_category_check;
alter table case_intake_option_lists add constraint case_intake_option_lists_category_check
  check (category = any (array['onset_cause', 'referral_source', 'diet_education', 'exercise_restriction', 'family_disease']));

insert into case_intake_option_lists (category, label, sort_order) values
  ('family_disease', '高血壓', 1),
  ('family_disease', '糖尿病', 2),
  ('family_disease', '心臟病', 3),
  ('family_disease', '腦中風', 4),
  ('family_disease', '癌症', 5),
  ('family_disease', '氣喘／過敏性疾病', 6),
  ('family_disease', '蟹足腫或肥厚性疤痕', 7),
  ('family_disease', '其他', 99)
on conflict do nothing;
