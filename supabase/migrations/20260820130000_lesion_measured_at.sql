-- 回診動線（2026-08-20）需要知道「這次回診有沒有重新量過尺寸」。
-- 沒有這個戳記，剛量的值跟三個月前量的值在資料上長得一模一樣。
--
-- ⚠️ 這**不是**尺寸的歷史紀錄：舊值仍然會被新值覆蓋，看不到病灶隨時間的變化。
-- 完整的時間序列（新增 lesion_measurements 表）是 pending.md E6，使用者決定先不做。
-- 這一欄同時補上 pending.md D3 規劃的「病灶測量」附表裡的「測量日」欄位。

alter table case_keloid_lesions add column if not exists measured_at date;

comment on column case_keloid_lesions.measured_at is
  '目前這組長寬高是哪一天量的。回診動線靠它判斷「這次回診有沒有重新量過」。注意：這不是尺寸的歷史紀錄，舊值仍會被覆蓋（見 pending.md E6）。';
