-- 日本瘢痕工作坊切口/疤痕評估量表（JSW Scar Scale, JSS 2015）。
-- 分成兩份獨立問卷：①診斷分類表（初診用，區分成熟疤痕/肥厚性疤痕/蟹足腫）②症狀與治療追蹤評估表（每次追蹤用，可比較 Delta Score）。
-- category 用 'other'（比照 SF-36/PSQI，避免跟 VSS 的 category='scale' 加總邏輯衝突——同一個案若同時有 VSS 與 JSS 回覆會互相覆蓋）。
-- 選項的 value 直接就是計分用的點數，加總即為總分，不需額外重新編碼表。

insert into questionnaire_templates (name, description, category) values
  ('JSS 疤痕診斷分類表', 'JSW Scar Scale 2015 版，初診時填寫用於區分成熟疤痕/肥厚性疤痕/蟹足腫（0-5分成熟疤痕、6-15分肥厚性疤痕、16分以上蟹足腫）。', 'other'),
  ('JSS 症狀與治療追蹤評估表', 'JSW Scar Scale 2015 版，每次追蹤填寫，6項客觀症狀各0-3分，總分0-18分，分數越高病況越嚴重；可與前次分數相減得 Delta Score 評估治療成效。', 'other')
on conflict do nothing;

-- 分類表 7 題
with t as (select id from questionnaire_templates where name = 'JSS 疤痕診斷分類表')
insert into questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required)
select t.id, v.order_no, v.question_text, 'single', v.options::jsonb, true
from t, (values
(1, '1. 高度與隆起 (Elevation)', '[{"value":"0","label":"扁平或輕微隆起，無明顯邊界突出"},{"value":"1","label":"局部隆起，未超過原傷口邊界"},{"value":"3","label":"明顯隆起且向外擴展，超過原傷口邊界"}]'),
(2, '2. 發紅與血管增生 (Erythema)', '[{"value":"0","label":"接近正常膚色或僅輕微發紅"},{"value":"1","label":"中度發紅（壓診可部分退色）"},{"value":"3","label":"鮮紅或紫紅色，充血明顯"}]'),
(3, '3. 硬度與浸潤 (Induration)', '[{"value":"0","label":"質地柔軟，與周圍皮膚相近"},{"value":"1","label":"中度變硬，觸診有結節感"},{"value":"3","label":"極度堅硬，呈板狀或硬塊"}]'),
(4, '4. 生長趨勢 (Growth Rate)', '[{"value":"0","label":"趨於穩定或逐漸消退"},{"value":"1","label":"緩慢增大（6個月內有變化）"},{"value":"3","label":"快速擴展，且伴隨明顯抓癢/疼痛"}]'),
(5, '5. 好發部位 (Anatomical Site)', '[{"value":"3","label":"高風險部位：前胸、肩部、上背部、耳垂、下頜角"},{"value":"2","label":"中風險部位：上臂、下肢、關節伸側"},{"value":"1","label":"低風險部位：面部（非下頜）、掌跖、頭皮"}]'),
(6, '6. 家族史（一等親有蟹足腫病史）', '[{"value":"2","label":"有"},{"value":"0","label":"無"}]'),
(7, '7. 個人史（身體其他部位曾診斷為蟹足腫或肥厚性疤痕）', '[{"value":"2","label":"有"},{"value":"0","label":"無"}]')
) as v(order_no, question_text, options);

-- 評估表 6 題
with t as (select id from questionnaire_templates where name = 'JSS 症狀與治療追蹤評估表')
insert into questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required)
select t.id, v.order_no, v.question_text, 'single', v.options::jsonb, true
from t, (values
(1, '1. 硬度 (Induration)', '[{"value":"0","label":"無硬化（柔軟）"},{"value":"1","label":"邊緣稍硬"},{"value":"2","label":"中度硬化"},{"value":"3","label":"板狀極硬"}]'),
(2, '2. 隆起高度 (Elevation)', '[{"value":"0","label":"完全平坦"},{"value":"1","label":"< 2mm"},{"value":"2","label":"2-5mm"},{"value":"3","label":"> 5mm"}]'),
(3, '3. 發紅程度 (Erythema)', '[{"value":"0","label":"無發紅（正常膚色）"},{"value":"1","label":"輕微粉紅"},{"value":"2","label":"明顯發紅"},{"value":"3","label":"暗紅或紫紅色"}]'),
(4, '4. 充血範圍 (Hyperemia)', '[{"value":"0","label":"無"},{"value":"1","label":"僅限疤痕中心"},{"value":"2","label":"擴及整個疤痕"},{"value":"3","label":"擴散至疤痕外正常皮膚"}]'),
(5, '5. 疼痛感 (Pain)', '[{"value":"0","label":"無疼痛"},{"value":"1","label":"偶發或輕微疼痛"},{"value":"2","label":"中度疼痛（影響日常生活）"},{"value":"3","label":"劇烈疼痛"}]'),
(6, '6. 瘙癢感 (Itching)', '[{"value":"0","label":"無瘙癢"},{"value":"1","label":"偶發或輕微瘙癢"},{"value":"2","label":"中度瘙癢（影響睡眠）"},{"value":"3","label":"劇烈瘙癢（難以忍受）"}]')
) as v(order_no, question_text, options);
