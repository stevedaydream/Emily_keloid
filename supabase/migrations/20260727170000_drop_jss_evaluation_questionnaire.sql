-- 決策 2026-07-27：JSS 量表只留一份。
-- 保留「JSS 疤痕診斷分類表」（12 題／總分 0-25，規格文件的正式 JSW Scar Scale 2015），
-- 刪除「JSS 症狀與治療追蹤評估表」（6 題／總分 0-18）。
-- 追蹤改為同一份正式量表重複施測（疤痕量表的標準用法），
-- Delta Score 改以歷次總分相減計算（見 src/lib/scoring.ts 與個案頁「問卷回覆紀錄」）。
--
-- 執行當下該問卷 0 筆回覆，所以不會有資料損失；下面仍保留了回覆的刪除，
-- 以防其他環境（或之後才跑這支 migration 的資料庫）已經有零星測試回覆。
do $$
declare qid uuid;
begin
  select id into qid from public.questionnaire_templates where name = 'JSS 症狀與治療追蹤評估表';
  if qid is null then
    return;
  end if;

  -- 個案時程／範本若指向這份問卷，先解除指定（欄位可為 null，不會刪掉時程項目本身）
  update public.case_schedule_items set questionnaire_id = null where questionnaire_id = qid;
  update public.schedule_template_items set questionnaire_id = null where questionnaire_id = qid;

  delete from public.questionnaire_answers
  where response_id in (select id from public.questionnaire_responses where questionnaire_id = qid);
  delete from public.questionnaire_responses where questionnaire_id = qid;
  delete from public.questionnaire_questions where questionnaire_id = qid;
  delete from public.questionnaire_templates where id = qid;
end $$;
