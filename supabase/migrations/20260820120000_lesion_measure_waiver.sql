-- 診間收案動線（2026-08-20）：病人自填完 → 量測長寬高＋拍照 → 醫師填 JSS 才算結束。
--
-- JSS 那一關「硬擋但可勾無法量測」（使用者決定）：預設要每個病灶都有長寬高與至少一張照片
-- 才能開 JSS；量不到／病人拒絕拍照時勾一個免除註記＋原因就放行，並記進待補清單。
--
-- 為什麼不用「留空就當免除」：留空和「量了但忘了存」在資料上長得一模一樣，
-- 事後分析分不出「這個病灶沒有高度」與「這個病灶的高度沒人量」。免除要是一個明確的動作。

alter table case_keloid_lesions
  add column if not exists measure_waived boolean not null default false,
  add column if not exists measure_waived_reason text,
  add column if not exists photo_waived boolean not null default false,
  add column if not exists photo_waived_reason text;

comment on column case_keloid_lesions.measure_waived is
  '此病灶的長寬高無法量測（例如位置量不到、病人不配合）。勾了才能跳過 JSS 前的檢查，原因記在 measure_waived_reason。';
comment on column case_keloid_lesions.photo_waived is
  '此病灶無法拍照（例如病人拒絕）。勾了才能跳過 JSS 前的檢查，原因記在 photo_waived_reason。';

-- 待補清單多一種原因：'waived' = 診間當下做不到而免除。
-- 原本三種都是「病人自填時答不出來」，免除是人員的決定，混進 skipped 會看不出差別。
alter table case_intake_followups drop constraint if exists case_intake_followups_reason_check;
alter table case_intake_followups
  add constraint case_intake_followups_reason_check
  check (reason in ('unknown', 'no_detail', 'skipped', 'waived'));
