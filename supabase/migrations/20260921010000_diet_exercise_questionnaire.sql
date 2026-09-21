-- 飲食與運動習慣問卷（Emily 2026-09-21《新增飲食運動調查_20260921.docx》）
--
-- 沿用 2026-07-24 那份佔位問卷（id 35bbc17c…，0 筆回覆）換成正式題目，並接進病人自填流程
-- （src/lib/patientIntake.ts 的 lifestyle 段）。名稱要與 SEGMENT_QUESTIONNAIRE_NAME.lifestyle 一致。
--
-- 計分：每題選項 value 即分數（0 從不／1 很少／2 偶爾／3 經常／4 幾乎每天），docx 未定義總分，
-- 目前只收逐題原始分數。
-- 「其他運動：＿＿」拆成兩題：頻率（病人版問）＋項目說明（text，病人版不問——病人版不出現自由文字，
-- 頻率答了 ≥1 時由人員在個案頁補，見 savePatientQuestionnaireAction 的待補邏輯）。

update public.questionnaire_templates
set name = '飲食與運動習慣問卷',
    description = '病人自填。飲食習慣 11 題、運動頻率 5 題，每題 0-4 分（從不／很少／偶爾／經常／幾乎每天），未定義總分，收逐題原始分數。「其他運動」的項目說明由人員補填。',
    category = 'lifestyle',
    active = true,
    required_for_intake = true
where id = '35bbc17c-20c9-4622-9bfa-709ed22665c8';

delete from public.questionnaire_questions where questionnaire_id = '35bbc17c-20c9-4622-9bfa-709ed22665c8';

insert into public.questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required)
select '35bbc17c-20c9-4622-9bfa-709ed22665c8', v.order_no, v.question_text, v.question_type, o.options::jsonb, v.required
from (values
  (1,  '飲食習慣：您平時多常「抽菸」？', 'single', 'diet', true),
  (2,  '飲食習慣：您平時多常「喝酒」？', 'single', 'diet', true),
  (3,  '飲食習慣：您平時多常吃「辛辣食物」？', 'single', 'diet', true),
  (4,  '飲食習慣：您平時多常吃「油炸食物」？', 'single', 'diet', true),
  (5,  '飲食習慣：您平時多常吃「堅果」？', 'single', 'diet', true),
  (6,  '飲食習慣：您平時多常吃「巧克力／甜食」？', 'single', 'diet', true),
  (7,  '飲食習慣：您平時多常吃「麵食類」？', 'single', 'diet', true),
  (8,  '飲食習慣：您平時多常吃「帶殼海鮮（如蝦、蟹、蛤蜊等）」？', 'single', 'diet', true),
  (9,  '飲食習慣：您平時多常吃「鴨肉／羊肉」？', 'single', 'diet', true),
  (10, '飲食習慣：您平時多常吃「補品／進補食物」？', 'single', 'diet', true),
  (11, '飲食習慣：您平時多常吃「芒果／龍眼／荔枝／榴槤」？', 'single', 'diet', true),
  (12, '運動頻率：您平時多常做「有氧運動」？', 'single', 'exercise', true),
  (13, '運動頻率：您平時多常做「重量訓練／阻力訓練（無氧運動）」？', 'single', 'exercise', true),
  (14, '運動頻率：您平時多常做「伸展／柔軟度運動」？', 'single', 'exercise', true),
  (15, '運動頻率：您平時多常做「胸部肌肉訓練（如臥推、胸推、伏地挺身等）」？', 'single', 'exercise', true),
  (16, '運動頻率：除了上面這些，您多常做「其他運動」？', 'single', 'exercise', true),
  (17, '其他運動項目說明（第16題有做時填寫）', 'text', 'none', false)
) as v(order_no, question_text, question_type, scale, required)
cross join lateral (
  select case v.scale
    when 'diet' then '[{"value":"0","label":"從不"},{"value":"1","label":"很少"},{"value":"2","label":"偶爾"},{"value":"3","label":"經常"},{"value":"4","label":"幾乎每天"}]'
    when 'exercise' then '[{"value":"0","label":"從不（0 次）"},{"value":"1","label":"很少（每月 1-2 次）"},{"value":"2","label":"偶爾（每週 1 次）"},{"value":"3","label":"經常（每週 2-4 次）"},{"value":"4","label":"幾乎每天（每週 5-7 次）"}]'
    else '[]'
  end as options
) o;

-- 病灶部位編號補齊（同日 Emily 要求：刪掉部位1 後，原本的部位2 要往前變部位1）。
-- 程式端 deleteKeloidLesionAction 之後會自動遞補；這裡把先前刪除留下的跳號一次補好。
update public.case_keloid_lesions l
set site_no = r.rn
from (
  select id, row_number() over (partition by case_id order by site_no nulls last, created_at) as rn
  from public.case_keloid_lesions
) r
where r.id = l.id and l.site_no is distinct from r.rn;
