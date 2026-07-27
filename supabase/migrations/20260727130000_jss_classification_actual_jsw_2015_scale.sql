-- Replace the JSS 疤痕診斷分類表 with the actual JSW Scar Scale 2015 diagnosis table
-- (12 items, option value = points, total 0-25). Score only; no auto-classification
-- (the spec provides item scores but no classification cut-off).
do $$
declare tid uuid;
begin
  select id into tid from questionnaire_templates where name = 'JSS 疤痕診斷分類表';
  if tid is null then return; end if;

  -- Clear old (7-item) demo responses/answers/questions for this template.
  delete from questionnaire_answers a using questionnaire_questions q
    where a.question_id = q.id and q.questionnaire_id = tid;
  delete from questionnaire_answers a using questionnaire_responses r
    where a.response_id = r.id and r.questionnaire_id = tid;
  delete from questionnaire_responses where questionnaire_id = tid;
  delete from questionnaire_questions where questionnaire_id = tid;

  update questionnaire_templates
    set description = 'JSW Scar Scale（JSS）2015 診斷分類表：12 項評估，選項分數加總為總分 0–25，分數越高越偏向蟹足腫。系統僅計算並顯示總分，分類切點由臨床判讀（規格文件未提供切點）。'
    where id = tid;

  insert into questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required) values
  (tid, 1,  '1. 人種 (Human race)', 'single', '[{"value":"2","label":"非洲裔 Africans"},{"value":"1","label":"其他 Other"},{"value":"0","label":"高加索裔 Caucasians"}]'::jsonb, true),
  (tid, 2,  '2. 家族傾向 (Familial tendency)', 'single', '[{"value":"1","label":"明顯有 Clearly exists"},{"value":"0","label":"不明顯 Not clearly"}]'::jsonb, true),
  (tid, 3,  '3. 數目 (Number)', 'single', '[{"value":"2","label":"多發 Multiple"},{"value":"0","label":"單一 Solitary"}]'::jsonb, true),
  (tid, 4,  '4. 部位 (Region)', 'single', '[{"value":"2","label":"前胸／肩胛-肩部／恥骨上區 Anterior chest, Scapular-Shoulder, Suprapubic"},{"value":"0","label":"其他 Other"}]'::jsonb, true),
  (tid, 5,  '5. 發病年齡 (Age onset)', 'single', '[{"value":"2","label":"0–30 歲"},{"value":"1","label":"31–60 歲"},{"value":"0","label":"60 歲以上"}]'::jsonb, true),
  (tid, 6,  '6. 成因 (Causes)', 'single', '[{"value":"3","label":"不明或微小外傷 Unknown or minute"},{"value":"0","label":"特定傷口類型(如手術) Specific wound type such as surgery"}]'::jsonb, true),
  (tid, 7,  '7. 大小 (Size)', 'single', '[{"value":"1","label":"大於 20 cm² Over 20cm2"},{"value":"0","label":"小於 20 cm² Under 20cm2"}]'::jsonb, true),
  (tid, 8,  '8. 垂直生長／隆起 (Vertical growth / Elevation)', 'single', '[{"value":"2","label":"明顯有 Clearly exists"},{"value":"0","label":"不明顯 Not clearly"}]'::jsonb, true),
  (tid, 9,  '9. 水平生長 (Horizontal growth)', 'single', '[{"value":"3","label":"明顯有 Clearly exists"},{"value":"0","label":"不明顯 Not clearly"}]'::jsonb, true),
  (tid, 10, '10. 形狀 (Shape)', 'single', '[{"value":"3","label":"特徵性形狀 Characteristic shape"},{"value":"0","label":"其他 Other"}]'::jsonb, true),
  (tid, 11, '11. 疤痕周圍紅斑 (Erythema around scars)', 'single', '[{"value":"2","label":"明顯 Clearly present"},{"value":"0","label":"不明顯 Not clearly"}]'::jsonb, true),
  (tid, 12, '12. 主觀症狀 (Subjective symptoms)', 'single', '[{"value":"2","label":"持續存在 Always exist"},{"value":"1","label":"間歇 Intermittent"},{"value":"0","label":"無 None"}]'::jsonb, true);
end $$;
