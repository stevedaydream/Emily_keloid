-- 問卷回覆可以「接續修改」（使用者要求 2026-08-25）。
--
-- 情境：診間護理師填到一半跳過幾題，之後再點進同一份問卷時，原本會開一份全新的空白回覆——
-- 已經填好的又要重打一次，而且資料庫裡會留下兩筆互相重疊的回覆。
--
-- 改成可以帶著上次的答案進來修改。為了看得出「哪幾題是後來改的、什麼時候改的」，
-- 逐題答案各自記一個 updated_at：
--   null   = 從第一次送出到現在沒動過
--   有值   = 最後一次被改動的時間（值真的變了才更新，只是重新送出同樣的內容不算）

alter table public.questionnaire_answers
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by text;

comment on column public.questionnaire_answers.updated_at is
  '這一題最後一次被改動的時間；null = 自首次送出後未曾修改。值沒變的重新送出不會更新。';
comment on column public.questionnaire_answers.updated_by is
  '最後一次改動這一題的操作者。';
