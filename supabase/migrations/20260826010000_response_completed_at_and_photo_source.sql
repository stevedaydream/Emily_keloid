-- 2026-08-26 收案平台討論：兩件事各加一欄。
--
-- ① questionnaire_responses.completed_at
--    SF-36／PSQI 改成「硬鎖，每翻一頁存一次」之後，資料庫裡會出現「存到一半被中斷」的半份問卷。
--    scoring.ts 對缺題是用官方的「已答題目平均」處理，所以一份只答了 19/36 題的 SF-36
--    照樣算得出一個看起來正常的 0-100 分——那個分數不能進研究資料。
--    跑完最後一頁才寫 completed_at；計分與匯出一律只取 completed_at is not null。
--    既有回覆全部回填 submitted_at：它們都是走完舊流程送出的，本來就是完成品。
--
-- ② photos.source
--    拍照改成也可以「從相簿選圖」候補（不一定要當下馬上拍）。上傳的照片沒經過對齊框／
--    比例尺蒙板，之後做影像對比時必須分得出來，不然診間標準拍攝與病人隨手拍會混在一起。
--    拍攝日期沿用既有的 taken_at（上傳時預帶檔案的 lastModified，人員可改）；
--    created_at 是上傳時間，「本次回診拍過了沒」改看它——否則補上三天前拍的照片
--    永遠無法讓回診動線那一步收掉。

alter table public.questionnaire_responses
  add column if not exists completed_at timestamp with time zone;

comment on column public.questionnaire_responses.completed_at is
  'When the respondent reached the end of the questionnaire. Null = partially saved draft; excluded from scoring and export.';

update public.questionnaire_responses
set completed_at = submitted_at
where completed_at is null;

alter table public.photos
  add column if not exists source text not null default 'camera';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'photos_source_check'
  ) then
    alter table public.photos
      add constraint photos_source_check check (source in ('camera', 'upload'));
  end if;
end $$;

comment on column public.photos.source is
  'camera = shot in-app through the alignment/scale mask; upload = picked from the device gallery afterwards.';
comment on column public.photos.taken_at is
  'When the photo was actually taken. For uploads this is backfilled from the file timestamp and is editable; use created_at for "was a photo added at this visit".';
