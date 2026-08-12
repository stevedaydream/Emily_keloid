-- 2026-08-12（同日稍晚）：人形圖恢復細分熱區。
--
-- 先前決策是「人形圖只留部長的 22 個部位」，但使用者實際操作後回饋：**點選細分部位比較直覺**。
-- 改為：細分熱區全部恢復可點選，其中對得上 1-21 碼的綁該碼，其餘一律綁 22（其他）。
-- export_code 在 20260812010000 就已逐一填好，這裡只需要把該恢復的 active 打開。
--
-- 恢復原則：**只恢復「有加值且不與現行熱區重複」的**。
-- 重複的（前胸/腹部/上臂/大腿/小腿/肩胛/上背/籠統耳/耳部細分）維持停用，
-- 否則選單會出現兩個同名項，使用者不知道該點哪個、匯出也會有兩個來源。
--
-- 結果：67 個可點選熱區，30 個對到 1-21 碼、37 個對到 22，0 個缺碼。

update public.body_part_zones set active = true where zone_key in (
  'front_head',
  'front_shoulder_l', 'front_shoulder_r',
  'front_forearm_l',  'front_forearm_r',
  'front_hand_l',     'front_hand_r',
  'front_clavicle_l', 'front_clavicle_r',
  'front_axilla_l',   'front_axilla_r',
  'front_elbow_l',    'front_elbow_r',
  'front_wrist_l',    'front_wrist_r',
  'front_groin_l',    'front_groin_r',
  'front_knee_l',     'front_knee_r',
  'front_ankle_l',    'front_ankle_r',
  'front_neck_side_l', 'front_neck_side_r'
);

update public.body_part_zones set active = true where zone_key in (
  'back_head', 'back_neck',
  'back_lower', 'back_buttocks',
  'back_upperarm_l', 'back_upperarm_r',
  'back_forearm_l',  'back_forearm_r',
  'back_thigh_l',    'back_thigh_r',
  'back_calf_l',     'back_calf_r',
  'back_elbow_l',    'back_elbow_r',
  'back_wrist_l',    'back_wrist_r',
  'back_knee_l',     'back_knee_r',
  'back_ankle_l',    'back_ankle_r'
);

-- 明確保持停用的重複項（寫出來是為了讓意圖可讀，避免日後有人「順手」全部打開）
update public.body_part_zones set active = false where zone_key in (
  'front_ear_l', 'front_ear_r',
  'front_neck', 'front_chest',
  'front_upperarm_l', 'front_upperarm_r',
  'front_abdomen', 'front_pubic',
  'front_thigh_l', 'front_thigh_r',
  'front_calf_l',  'front_calf_r',
  'back_scapular_l', 'back_scapular_r',
  'back_upper',
  'head_ear_helix_l', 'head_ear_helix_r',
  'head_ear_lobe_l',  'head_ear_lobe_r',
  'head_ear_post_l',  'head_ear_post_r'
);
