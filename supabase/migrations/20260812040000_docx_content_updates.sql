-- 2026-08-12 docx（收案資料平台修改_20260812.docx）的內容類修改。
--   項次 1：治療紀錄刪除「壓力衣」
--   項次 2：病人問卷的「您的蟹足腫是怎麼來的？」整組換成「您此次至本院就診的主要原因為何？」
--   LINE 衛教：刪掉「蟹足腫會遺傳嗎」的第一段、刪掉放射治療衛教的前兩個小單元
-- （LINE 衛教的「壓力衣/矽膠片要戴多久」→「矽膠片要戴多久」先前已改過，這裡不重複。）

-- ===== 項次 1：治療方式移除「壓力衣」 =====
-- 用停用而非刪除：已有治療紀錄引用它時硬刪會被外鍵擋下，停用則是選單不再出現、既有紀錄照常顯示。
update public.treatment_types set active = false where name = '壓力衣';

-- ===== 項次 2：新增「此次就診主要原因」選單 =====
-- 這是**病人自填問卷**裡的題目，取代原本問「蟹足腫是怎麼來的」（那題綁的是 keloid_history_type）。
-- 注意：發生原因（onset_cause）本身不動——它是部長 Excel 的 KC 碼來源，是另一題；
--      keloid_history_type 也保留，改由診間人員在個案頁記錄。
alter table public.case_intake_option_lists drop constraint if exists case_intake_option_lists_category_check;
alter table public.case_intake_option_lists add constraint case_intake_option_lists_category_check
  check (category = any (array[
    'onset_cause', 'referral_source', 'diet_education', 'exercise_restriction',
    'family_disease', 'keloid_history_type', 'keloid_symptom', 'symptom_change', 'visit_reason'
  ]));

alter table public.case_intake_option_records drop constraint if exists case_intake_option_records_category_check;
alter table public.case_intake_option_records add constraint case_intake_option_records_category_check
  check (category = any (array[
    'onset_cause', 'referral_source', 'diet_education', 'exercise_restriction',
    'family_disease', 'keloid_history_type', 'keloid_symptom', 'symptom_change', 'visit_reason'
  ]));

insert into public.case_intake_option_lists (category, label, sort_order, export_code) values
  ('visit_reason', '初次發生蟹足腫，尋求治療',                   1, 1),
  ('visit_reason', '已接受治療，但效果不理想，尋求其他治療方式', 2, 2),
  ('visit_reason', '治療後復發，尋求再次治療',                   3, 3),
  ('visit_reason', '曾多次治療及復發，尋求進一步治療',           4, 4),
  ('visit_reason', '原有治療效果良好，希望持續接受治療或追蹤',   5, 5),
  ('visit_reason', '希望取得第二醫療意見或了解其他治療選擇',     6, 6),
  ('visit_reason', '其他',                                       7, 7)
on conflict do nothing;

-- 得知看診資訊也補上代碼：它與就診原因一樣，部長 4 張主表沒有欄位，
-- 資料放在匯出的「收案選項紀錄」附表，附表要顯示代碼就得有碼。
update public.case_intake_option_lists set export_code = sort_order
where category = 'referral_source' and export_code is null;

-- ===== LINE 衛教內容 =====
-- 「蟹足腫會遺傳嗎？」刪掉第一段（"蟹足腫不會傳染…"）。
-- 注意：直接砍掉第一句會讓第二句的「不過」變成沒有前文的轉折，所以一併調整了文氣。
update public.health_education_kb
set content = '蟹足腫和體質有關，有家族史的人比較容易發生，這也是收案時會詢問家族史的原因。
若家人身上也有類似的疤痕增生，可以建議他們就醫評估。'
where topic = '蟹足腫會遺傳嗎？';

-- 放射治療衛教只留最後的皮膚照顧，前兩個小單元停用
update public.health_education_kb set active = false
where topic in ('放射治療會不會痛？', '放射治療為什麼要連續做？可以改天嗎？');
