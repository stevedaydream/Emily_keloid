-- Reference data for the new body-zone / radiotherapy / health-education tables.

insert into radiotherapy_dose_protocols (dose_category, label, fraction_count, per_fraction_dose_cgy, total_dose_cgy) values
  ('chest_scapular', '胸/肩胛區', 3, 600, 1800),
  ('ear', '耳朵', 1, 800, 800),
  ('other', '其他部位', 2, 750, 1500)
on conflict (dose_category) do nothing;

insert into body_part_zones (zone_key, view, display_name, dose_category, sort_order) values
  ('front_head', 'front', '頭部', 'other', 1),
  ('front_ear_l', 'front', '左耳', 'ear', 2),
  ('front_ear_r', 'front', '右耳', 'ear', 3),
  ('front_neck', 'front', '前頸', 'other', 4),
  ('front_chest', 'front', '前胸', 'chest_scapular', 5),
  ('front_shoulder_l', 'front', '左肩', 'chest_scapular', 6),
  ('front_shoulder_r', 'front', '右肩', 'chest_scapular', 7),
  ('front_upperarm_l', 'front', '左上臂', 'other', 8),
  ('front_upperarm_r', 'front', '右上臂', 'other', 9),
  ('front_forearm_l', 'front', '左前臂', 'other', 10),
  ('front_forearm_r', 'front', '右前臂', 'other', 11),
  ('front_hand_l', 'front', '左手', 'other', 12),
  ('front_hand_r', 'front', '右手', 'other', 13),
  ('front_abdomen', 'front', '腹部', 'other', 14),
  ('front_thigh_l', 'front', '左大腿', 'other', 15),
  ('front_thigh_r', 'front', '右大腿', 'other', 16),
  ('front_calf_l', 'front', '左小腿', 'other', 17),
  ('front_calf_r', 'front', '右小腿', 'other', 18),
  ('back_head', 'back', '後腦', 'other', 1),
  ('back_neck', 'back', '後頸', 'other', 2),
  ('back_scapular_l', 'back', '左肩胛', 'chest_scapular', 3),
  ('back_scapular_r', 'back', '右肩胛', 'chest_scapular', 4),
  ('back_upper', 'back', '上背', 'chest_scapular', 5),
  ('back_lower', 'back', '下背/腰', 'other', 6),
  ('back_upperarm_l', 'back', '左上臂後', 'other', 7),
  ('back_upperarm_r', 'back', '右上臂後', 'other', 8),
  ('back_forearm_l', 'back', '左前臂後', 'other', 9),
  ('back_forearm_r', 'back', '右前臂後', 'other', 10),
  ('back_buttocks', 'back', '臀部', 'other', 11),
  ('back_thigh_l', 'back', '左大腿後', 'other', 12),
  ('back_thigh_r', 'back', '右大腿後', 'other', 13),
  ('back_calf_l', 'back', '左小腿後', 'other', 14),
  ('back_calf_r', 'back', '右小腿後', 'other', 15)
on conflict (zone_key) do nothing;

insert into health_education_kb (topic, content, sort_order) values
  ('傷口/疤痕會癢怎麼辦', '蟹足腫在增生期常見搔癢，可用醫師開立的止癢藥膏，避免抓搔以免刺激增生。若持續劇癢或合併紅腫熱痛，請於下次回診或提前聯繫診間。', 1),
  ('壓力衣/矽膠片要戴多久', '一般建議每日配戴 18-23 小時，持續數個月，實際天數與部位請以主治醫師指示為準，勿自行停用。', 2),
  ('傷口照顧與飲食注意事項', '傷口癒合期間請維持均衡飲食，避免菸酒；個別飲食禁忌請依醫師/護理師的說明為準，本機器人不提供未經診間確認的飲食建議。', 3);
