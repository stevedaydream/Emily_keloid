-- 人形部位圖擴充（2026-07-28，部長指示）：
--   ① 新增關節與先前缺漏的部位（肘/膝/腕/踝/腋下/鼠蹊/恥骨上區/頸側/鎖骨上區）
--   ② 新增第三個檢視 'head'（頭頸特寫）供耳朵細分（耳垂/耳廓/耳後），解決耳朵熱區在手機上太小按不到的問題
-- 新部位的劑量分類一律為 'other'（15Gy×2），決策 2026-07-28；耳朵細分沿用 'ear'（8Gy×1）。
-- 既有的 front_ear_l / front_ear_r 保留不動（正面仍可點籠統的左/右耳，舊資料掛在上面）。

alter table public.body_part_zones drop constraint if exists body_part_zones_view_check;
alter table public.body_part_zones
  add constraint body_part_zones_view_check check (view = any (array['front'::text, 'back'::text, 'head'::text]));

comment on column public.body_part_zones.view is 'Which diagram view the zone belongs to: front / back / head (head = zoomed head-and-neck close-up used for ear subregions).';

insert into public.body_part_zones (zone_key, view, display_name, dose_category, sort_order, active) values
  -- 正面：關節與新增部位
  ('front_neck_side_l',  'front', '左頸側',   'other', 20, true),
  ('front_neck_side_r',  'front', '右頸側',   'other', 21, true),
  ('front_clavicle_l',   'front', '左鎖骨上區', 'other', 22, true),
  ('front_clavicle_r',   'front', '右鎖骨上區', 'other', 23, true),
  ('front_axilla_l',     'front', '左腋下',   'other', 24, true),
  ('front_axilla_r',     'front', '右腋下',   'other', 25, true),
  ('front_elbow_l',      'front', '左肘關節', 'other', 26, true),
  ('front_elbow_r',      'front', '右肘關節', 'other', 27, true),
  ('front_wrist_l',      'front', '左腕關節', 'other', 28, true),
  ('front_wrist_r',      'front', '右腕關節', 'other', 29, true),
  ('front_groin_l',      'front', '左鼠蹊',   'other', 30, true),
  ('front_groin_r',      'front', '右鼠蹊',   'other', 31, true),
  ('front_pubic',        'front', '恥骨上區', 'other', 32, true),
  ('front_knee_l',       'front', '左膝關節', 'other', 33, true),
  ('front_knee_r',       'front', '右膝關節', 'other', 34, true),
  ('front_ankle_l',      'front', '左踝關節', 'other', 35, true),
  ('front_ankle_r',      'front', '右踝關節', 'other', 36, true),
  -- 背面：關節
  ('back_elbow_l',       'back',  '左肘後',   'other', 20, true),
  ('back_elbow_r',       'back',  '右肘後',   'other', 21, true),
  ('back_wrist_l',       'back',  '左腕後',   'other', 22, true),
  ('back_wrist_r',       'back',  '右腕後',   'other', 23, true),
  ('back_knee_l',        'back',  '左膝窩',   'other', 24, true),
  ('back_knee_r',        'back',  '右膝窩',   'other', 25, true),
  ('back_ankle_l',       'back',  '左踝後',   'other', 26, true),
  ('back_ankle_r',       'back',  '右踝後',   'other', 27, true),
  -- 頭頸特寫：耳朵細分（舊資料本來就有 ear lobe / helix / postauricular 三種寫法）
  ('head_ear_helix_l',   'head',  '左耳廓',   'ear',    1, true),
  ('head_ear_helix_r',   'head',  '右耳廓',   'ear',    2, true),
  ('head_ear_lobe_l',    'head',  '左耳垂',   'ear',    3, true),
  ('head_ear_lobe_r',    'head',  '右耳垂',   'ear',    4, true),
  ('head_ear_post_l',    'head',  '左耳後',   'ear',    5, true),
  ('head_ear_post_r',    'head',  '右耳後',   'ear',    6, true)
on conflict (zone_key) do nothing;
