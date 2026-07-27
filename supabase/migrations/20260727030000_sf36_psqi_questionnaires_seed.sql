-- SF-36 健康調查簡表（36題）與匹茲堡睡眠品質量表 PSQI（18題）題目建置。
-- 內容來自台灣/IQOLA 標準中文版與衛福部桃園療養院網站中文版（2026-07-27 使用者提供）。
-- 兩者皆為病人自填問卷，category 用 'other'（不用 'scale'，避免跟 VSS 匯出邏輯的 order_no 1-4 假設衝突）。
-- 正式計分公式（SF-36 各分量表轉換為0-100分；PSQI 7面向組合計算0-21分）皆比單題加總複雜，尚未實作自動計分。

insert into questionnaire_templates (name, description, category) values
  ('SF-36 健康調查簡表', '台灣/IQOLA 標準中文版，共36道子題，病人自填。正式計分為標準轉換公式（各分量表0-100分），非簡單加總，計分邏輯待後續開發。', 'other'),
  ('匹茲堡睡眠品質量表（PSQI）', '中文版睡眠品質量表，病人自填。正式計分為7大面向組合計算（0-21分，≥5分視為睡眠品質不佳），非單題加總，計分邏輯待後續開發。', 'other')
on conflict do nothing;

-- SF-36 Q1-2
with t as (select id from questionnaire_templates where name = 'SF-36 健康調查簡表')
insert into questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required)
select t.id, v.order_no, v.question_text, 'single', v.options::jsonb, true
from t, (values
(1, '1. 一般來說，您認為您目前的健康狀況是？', '[{"value":"1","label":"極好的"},{"value":"2","label":"很好"},{"value":"3","label":"好"},{"value":"4","label":"一般"},{"value":"5","label":"差"}]'),
(2, '2. 跟一年前相比，您覺得您現在的健康狀況是？', '[{"value":"1","label":"比一年前好多了"},{"value":"2","label":"比一年前好一些"},{"value":"3","label":"跟一年前差不多"},{"value":"4","label":"比一年前差一些"},{"value":"5","label":"比一年前差多了"}]')
) as v(order_no, question_text, options)
on conflict do nothing;

-- SF-36 Q3a-j
with t as (select id from questionnaire_templates where name = 'SF-36 健康調查簡表'),
     opt as (select '[{"value":"1","label":"限制很大"},{"value":"2","label":"有一點限制"},{"value":"3","label":"毫無限制"}]'::jsonb as o)
insert into questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required)
select t.id, v.order_no, v.question_text, 'single', opt.o, true
from t, opt, (values
(3, '3a. 劇烈運動：如跑步、搬重物、或參加劇烈的體育活動'),
(4, '3b. 中等強度的活動：如搬桌子、使用吸塵器、玩保齡球或打太極拳'),
(5, '3c. 提起或攜帶蔬菜、食品或雜貨'),
(6, '3d. 上幾層樓梯'),
(7, '3e. 上一層樓梯'),
(8, '3f. 彎腰、跪下或俯身'),
(9, '3g. 步行十條街以上（約一公里）'),
(10, '3h. 步行幾條街（幾百公尺）'),
(11, '3i. 步行一條街（約一百公尺）'),
(12, '3j. 自己洗澡或穿衣服')
) as v(order_no, question_text);

-- SF-36 Q4a-d, Q5a-c（是/否）
with t as (select id from questionnaire_templates where name = 'SF-36 健康調查簡表'),
     opt as (select '[{"value":"1","label":"是"},{"value":"2","label":"否"}]'::jsonb as o)
insert into questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required)
select t.id, v.order_no, v.question_text, 'single', opt.o, true
from t, opt, (values
(13, '4a.（身體健康原因）減少了工作或其他日常活動的時間'),
(14, '4b.（身體健康原因）實際做完的工作比想做的少'),
(15, '4c.（身體健康原因）工作或其他活動的種類受到限制'),
(16, '4d.（身體健康原因）做工作或其他活動時感到困難（例如：需要額外的努力）'),
(17, '5a.（情緒原因，如感到壓抑或憂慮）減少了工作或其他日常活動的時間'),
(18, '5b.（情緒原因）實際做完的工作比想做的少'),
(19, '5c.（情緒原因）做工作或其他活動時不如往常那樣細心')
) as v(order_no, question_text);

-- SF-36 Q6-8
with t as (select id from questionnaire_templates where name = 'SF-36 健康調查簡表')
insert into questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required)
select t.id, v.order_no, v.question_text, 'single', v.options::jsonb, true
from t, (values
(20, '6. 在過去四個星期裡，您的身體健康或情緒問題，在多大程度上影響了您與家人、朋友、鄰居或同事的正常社交活動？', '[{"value":"1","label":"完全沒有影響"},{"value":"2","label":"有一點影響"},{"value":"3","label":"中等程度影響"},{"value":"4","label":"影響很大"},{"value":"5","label":"影響非常大"}]'),
(21, '7. 在過去四個星期裡，您身體哪個部位有疼痛？疼痛程度如何？', '[{"value":"1","label":"完全沒有"},{"value":"2","label":"很輕微"},{"value":"3","label":"輕微"},{"value":"4","label":"中等程度"},{"value":"5","label":"嚴重"},{"value":"6","label":"很嚴重"}]'),
(22, '8. 在過去四個星期裡，身體的疼痛影響您的正常工作（包括上班和做家務）有多大？', '[{"value":"1","label":"完全沒有影響"},{"value":"2","label":"有一點影響"},{"value":"3","label":"中等程度影響"},{"value":"4","label":"影響很大"},{"value":"5","label":"影響非常大"}]')
) as v(order_no, question_text, options);

-- SF-36 Q9a-i
with t as (select id from questionnaire_templates where name = 'SF-36 健康調查簡表'),
     opt as (select '[{"value":"1","label":"持續如此"},{"value":"2","label":"常常如此"},{"value":"3","label":"較多時候如此"},{"value":"4","label":"有時如此"},{"value":"5","label":"很少如此"},{"value":"6","label":"從不如此"}]'::jsonb as o)
insert into questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required)
select t.id, v.order_no, v.question_text, 'single', opt.o, true
from t, opt, (values
(23, '9a. 您覺得生活充滿精力嗎？'),
(24, '9b. 您是一個高度緊張的人嗎？'),
(25, '9c. 您感到心情沉重、沒什麼能使您高興起來嗎？'),
(26, '9d. 您感到心平氣和、安寧嗎？'),
(27, '9e. 您覺得精力充沛嗎？'),
(28, '9f. 您感到情緒低落、悶悶不樂嗎？'),
(29, '9g. 您感到筋疲力盡嗎？'),
(30, '9h. 您是一個快樂的人嗎？'),
(31, '9i. 您感到疲勞嗎？')
) as v(order_no, question_text);

-- SF-36 Q10
with t as (select id from questionnaire_templates where name = 'SF-36 健康調查簡表')
insert into questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required)
select t.id, 32, '10. 在過去四個星期裡，您的身體健康或情緒問題，有多少時間影響了您的社交活動（如探親、訪友等）？', 'single',
  '[{"value":"1","label":"持續如此"},{"value":"2","label":"常常如此"},{"value":"3","label":"有時如此"},{"value":"4","label":"很少如此"},{"value":"5","label":"從不如此"}]'::jsonb, true
from t;

-- SF-36 Q11a-d
with t as (select id from questionnaire_templates where name = 'SF-36 健康調查簡表'),
     opt as (select '[{"value":"1","label":"完全正確"},{"value":"2","label":"基本正確"},{"value":"3","label":"不知道"},{"value":"4","label":"基本錯誤"},{"value":"5","label":"完全錯誤"}]'::jsonb as o)
insert into questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required)
select t.id, v.order_no, v.question_text, 'single', opt.o, true
from t, opt, (values
(33, '11a. 我好像比別人容易生病'),
(34, '11b. 我跟任何我認識的人一樣健康'),
(35, '11c. 我覺得我的健康狀況在變壞'),
(36, '11d. 我的健康狀況極好')
) as v(order_no, question_text);

-- PSQI Q1-4（時間類）
with t as (select id from questionnaire_templates where name = '匹茲堡睡眠品質量表（PSQI）')
insert into questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required)
select t.id, v.order_no, v.question_text, v.qtype, '[]'::jsonb, false
from t, (values
(1, '1. 通常您幾點上床睡覺？（例：23:30）', 'text'),
(2, '2. 通常您躺床後多久才能入睡？（分鐘）', 'number'),
(3, '3. 您早上通常幾點起床？（例：07:00）', 'text'),
(4, '4. 實際上您每晚可以睡幾小時？（例：6.5小時）', 'text')
) as v(order_no, question_text, qtype);

-- PSQI Q5a-i（0-3分頻率）+ Q5j（其他，文字說明）
with t as (select id from questionnaire_templates where name = '匹茲堡睡眠品質量表（PSQI）'),
     opt as (select '[{"value":"0","label":"0分・從未發生"},{"value":"1","label":"1分・不到一次"},{"value":"2","label":"2分・約一兩次"},{"value":"3","label":"3分・三次或以上"}]'::jsonb as o)
insert into questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required)
select t.id, v.order_no, v.question_text, 'single', opt.o, true
from t, opt, (values
(5, '5a. 過去一個月，無法在30分鐘內入睡的頻率'),
(6, '5b. 過去一個月，半夜或凌晨便清醒的頻率'),
(7, '5c. 過去一個月，必須起來上廁所的頻率'),
(8, '5d. 過去一個月，覺得呼吸不順暢的頻率'),
(9, '5e. 過去一個月，大聲打鼾或咳嗽的頻率'),
(10, '5f. 過去一個月，會覺得冷的頻率'),
(11, '5g. 過去一個月，覺得躁熱的頻率'),
(12, '5h. 過去一個月，作惡夢的頻率'),
(13, '5i. 過去一個月，身上有疼痛的頻率')
) as v(order_no, question_text);

with t as (select id from questionnaire_templates where name = '匹茲堡睡眠品質量表（PSQI）')
insert into questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required)
select t.id, 14, '5j. 其他睡眠困擾原因說明（若有，請描述及發生頻率）', 'text', '[]'::jsonb, false
from t;

-- PSQI Q6-9
with t as (select id from questionnaire_templates where name = '匹茲堡睡眠品質量表（PSQI）')
insert into questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required)
select t.id, v.order_no, v.question_text, 'single', v.options::jsonb, true
from t, (values
(15, '6. 過去一個月，您覺得自己的整體睡眠品質如何？', '[{"value":"0","label":"0分・很好"},{"value":"1","label":"1分・還不錯"},{"value":"2","label":"2分・差了點"},{"value":"3","label":"3分・很差"}]'),
(16, '7. 過去一個月，一星期幾個晚上需要使用藥物幫忙睡眠？', '[{"value":"0","label":"0分・未發生"},{"value":"1","label":"1分・不到一次"},{"value":"2","label":"2分・一兩次"},{"value":"3","label":"3分・三次或三次以上"}]'),
(17, '8. 過去一個月，是否曾在用餐、開車或社交場合瞌睡而無法保持清醒，每星期約幾次？', '[{"value":"0","label":"0分・未發生"},{"value":"1","label":"1分・不到一次"},{"value":"2","label":"2分・一兩次"},{"value":"3","label":"3分・三次或三次以上"}]'),
(18, '9. 過去一個月，您會感到無心完成該做的事嗎？', '[{"value":"0","label":"0分・沒有"},{"value":"1","label":"1分・有一點"},{"value":"2","label":"2分・的確有"},{"value":"3","label":"3分・很嚴重"}]')
) as v(order_no, question_text, options);
