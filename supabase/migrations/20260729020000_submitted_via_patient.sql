-- 病人自助填寫（決策 2026-07-29）需要一個新的來源值 'patient'，跟人員代填的 'staff' 區分，
-- 之後分析才知道某份回覆是病人自己答的還是護理師代打的。
-- 原本的 CHECK 只允許 line_sim / staff（line_sim 是已停用的舊 LINE 路徑，保留給既有資料）。
alter table public.questionnaire_responses
  drop constraint if exists questionnaire_responses_submitted_via_check;
alter table public.questionnaire_responses
  add constraint questionnaire_responses_submitted_via_check
  check (submitted_via in ('line_sim', 'staff', 'patient'));

comment on column public.questionnaire_responses.submitted_via is
  'Who actually filled this response in: staff = clinic staff entered it, patient = the patient answered it themselves on the handed-over tablet (/patient/[caseId]/intake), line_sim = the retired LINE self-entry path (legacy rows only).';

-- 照片目前一律由診間人員操作（病人自填流程刻意不含拍照——背部/肩胛病人自己拍不到，
-- 且對齊蒙板與比例尺需要技巧）。這裡一併放寬只是為了讓兩張表的值域一致，暫時不會被寫入。
alter table public.photos
  drop constraint if exists photos_uploaded_via_check;
alter table public.photos
  add constraint photos_uploaded_via_check
  check (uploaded_via in ('line_sim', 'staff', 'patient'));
