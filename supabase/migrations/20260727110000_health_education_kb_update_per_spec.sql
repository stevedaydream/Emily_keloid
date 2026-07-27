-- Update the health-education KB with the confirmed diet-restriction list and
-- post-op care items from the clinical spec (Keloid 收案資料平台建置, 2026-07-27).
update public.health_education_kb
set content = '傷口癒合期間請維持均衡飲食。以下忌口與建議依主治醫師確認：
忌口（避免）：1. 刺激性食物：菸、酒、辛辣、油炸等；2. 堅果、巧克力、甜食、麵食類；3. 帶殼海鮮：蟹、蝦、蛤蜊等；4. 鴨肉、羊肉、進補食物；5. 芒果、龍眼、荔枝、榴槤等。
建議：宜清淡、原型食物。個別狀況仍請以診間醫師/護理師的說明為準。'
where topic = '傷口照顧與飲食注意事項';

insert into public.health_education_kb (topic, content, sort_order)
select '蟹足腫治療術後注意事項',
       '1. 暫勿運動，以防拉扯傷口。
2. 傷口或疤痕搔癢時，請勿用手抓，可輕拍緩解並儘早回診。',
       10
where not exists (select 1 from public.health_education_kb where topic = '蟹足腫治療術後注意事項');
