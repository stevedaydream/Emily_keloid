-- PSQI 補齊第10、11題（睡伴／室友相關），原本 20260727030000 的種子只建到第9題（order_no 1-18）。
-- 來源：docs/Keloid 收案資料平台建置_20260727_1.docx 的「匹茲堡睡眠品質量表」正式版本。
--
-- 這兩題**不列入 PSQI 7 面向計分**（Buysse et al. 1989 原始演算法只用 Q1-Q9），
-- 屬於睡眠呼吸中止／肢動症的篩檢資訊，因此 src/lib/scoring.ts 的 computePSQI 不需改動。
--
-- order_no 一律往後接（19-24），不動既有 1-18 的編號——scoring.ts 是照 order_no 取值的。
-- 第11題以「假如有睡伴或室友」為前提，所以 required = false（沒有睡伴的人可以留白）；
-- 病人自填流程另外會在第10題答「沒有睡伴或室友」時直接跳過第11題。

-- 10. 睡伴／室友狀況（單選 0-3）
with t as (select id from questionnaire_templates where name = '匹茲堡睡眠品質量表（PSQI）')
insert into questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required)
select t.id, 19, '10. 您有睡伴或室友嗎？',
       'single',
       '[{"value":"0","label":"0分・沒有睡伴或室友"},{"value":"1","label":"1分・睡伴或室友不同臥房"},{"value":"2","label":"2分・睡伴或室友同臥房但不同床"},{"value":"3","label":"3分・睡伴或室友同床"}]'::jsonb,
       true
from t
where not exists (
  select 1 from questionnaire_questions q where q.questionnaire_id = t.id and q.order_no = 19
);

-- 11a-11d. 由睡伴／室友觀察到的情形（0-3分頻率）
with t as (select id from questionnaire_templates where name = '匹茲堡睡眠品質量表（PSQI）'),
     opt as (select '[{"value":"0","label":"0分・從未發生"},{"value":"1","label":"1分・不到一次"},{"value":"2","label":"2分・約一兩次"},{"value":"3","label":"3分・三次或以上"}]'::jsonb as o)
insert into questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required)
select t.id, v.order_no, v.question_text, 'single', opt.o, false
from t, opt, (values
(20, '11a. 過去一個月，睡伴或室友觀察到您大聲打鼾的頻率'),
(21, '11b. 過去一個月，睡伴或室友觀察到您入睡中出現一陣子停止呼吸的頻率'),
(22, '11c. 過去一個月，睡伴或室友觀察到您入睡中腳（含腿部）抽動或顫動的頻率'),
(23, '11d. 過去一個月，睡伴或室友觀察到您夜間起來意識混亂或人時地分不清楚的頻率')
) as v(order_no, question_text)
where not exists (
  select 1 from questionnaire_questions q where q.questionnaire_id = t.id and q.order_no = v.order_no
);

-- 11e. 其他躁動不安情形（比照 5j 的作法：只收文字說明，請一併描述發生頻率）
with t as (select id from questionnaire_templates where name = '匹茲堡睡眠品質量表（PSQI）')
insert into questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required)
select t.id, 24, '11e. 其他入睡中的躁動與不安情形（若有，請描述及發生頻率）', 'text', '[]'::jsonb, false
from t
where not exists (
  select 1 from questionnaire_questions q where q.questionnaire_id = t.id and q.order_no = 24
);

update questionnaire_templates
set description = '中文版睡眠品質量表，病人自填，共24道子題（第1-9題為計分題，第10-11題為睡伴／室友觀察的篩檢題不計分）。正式計分為7大面向組合計算（0-21分，>5分視為睡眠品質不佳），非單題加總。'
where name = '匹茲堡睡眠品質量表（PSQI）';
