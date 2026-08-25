-- VSS 全面移除（助理 2026-08-24 裁決：疤痕評分只留 JSS 疤痕診斷分類表）。
--
-- 背景：pending.md E5 問「多病灶的病人 VSS 要每顆各評一次還是只評主病灶」，
-- 回覆是「只評估主要手術那顆蟹足腫病灶」，並同時決定 **VSS 整份不再收**。
-- 兩份量表本來就有一半的題目在量同一件事（JSS 的「11. 疤痕周圍紅斑」vs VSS 的「血管分布」、
-- 「8. 垂直生長」vs「高度/厚度」），留 JSS 一份即可。
--
-- 這裡是真的刪資料（助理選項 A）：VSS 只有 1 筆 demo 回覆，沒有正式收案資料要保。
-- 匯出主表的 `VSS score` 欄**保留留白**（部長 Excel 的欄位順序不能整排位移），
-- 由「欄位缺口清單」附表註明已停收。
--
-- schedule_template_items 有 2 筆示範時程項目掛著 VSS（第 1、6 個月），
-- 剛好落在新定案的追蹤時間點上，改指向 JSS 而不是連項目一起刪。

do $$
declare
  vss_id uuid;
  jss_id uuid;
begin
  select id into vss_id from public.questionnaire_templates where name = 'Vancouver Scar Scale (VSS)';
  if vss_id is null then
    return;
  end if;
  select id into jss_id from public.questionnaire_templates where name = 'JSS 疤痕診斷分類表';

  -- 時程項目改指向 JSS（找不到 JSS 就退成「沒有指定問卷」，不讓外鍵擋住刪除）
  update public.schedule_template_items set questionnaire_id = jss_id where questionnaire_id = vss_id;
  update public.case_schedule_items set questionnaire_id = jss_id where questionnaire_id = vss_id;

  delete from public.questionnaire_answers a
   using public.questionnaire_responses r
   where a.response_id = r.id and r.questionnaire_id = vss_id;
  delete from public.questionnaire_responses where questionnaire_id = vss_id;
  delete from public.questionnaire_questions where questionnaire_id = vss_id;
  delete from public.questionnaire_templates where id = vss_id;
end $$;
