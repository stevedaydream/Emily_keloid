-- 2026-08-12 對齊部長新版 Excel 編碼簿（docs/Keloid Operation treat.xlsx）
--
-- 該檔是一份「編碼簿」：4 張工作表（Basic Info. / Operation / Year 1 / Year 2），
-- 每張只有第 1 列編碼說明＋第 2 列欄名，沒有資料列。要求匯出時所有選項欄位都以數字碼呈現。
--
-- 本 migration 做三件事：
--   ① 後台可維護清單各加一個 export_code 欄位（匯出用數字碼，後台可編）
--   ② 人形圖熱區改為部長的 22 碼 ＋ 左/右耳後，舊 64 個熱區停用不刪並逐一回填 export_code
--   ③ 發生原因清單補齊到部長碼表的 8 項
--
-- 決策背景（2026-08-12 與使用者確認）：
--   - 上線時會清空資料庫從零收案，舊病人由助理手動補齊 → 舊熱區停用即可，不需回填工程
--   - 部位改採部長 22 碼（而非保留 64 個細分再壓縮），收案端產生什麼匯出就永遠是什麼
--   - 22 碼沒有「耳後」，但耳後的放療劑量必須是耳（8Gy×1）而非其他（15Gy×2），
--     故額外保留左/右耳後兩個熱區，dose_category='ear' 但 export_code=22

-- ===== ① export_code 欄位 =====

alter table public.body_part_zones      add column if not exists export_code  int;
alter table public.body_part_zones      add column if not exists export_label text;
alter table public.case_intake_option_lists add column if not exists export_code int;
alter table public.doctors              add column if not exists export_code  int;
alter table public.icd_codes            add column if not exists export_code  int;
alter table public.treatment_types      add column if not exists export_code  int;

comment on column public.body_part_zones.export_code is
  '匯出用數字碼，對應部長 2026-08 版 Excel 的部位碼 1-22（22=other）。多個熱區可共用同一碼（例如左/右耳後都是 22）。null 代表尚未指定，匯出時會列進「未能對應清單」。';
comment on column public.body_part_zones.export_label is
  '部長碼表上該碼的英文原文（例如 "L''t helix"），供匯出檔的「編碼對照表」工作表顯示。';
comment on column public.case_intake_option_lists.export_code is
  '匯出用數字碼，對應部長碼表（發生原因 1-8、症狀 1-9 等）。null 代表該選項不在部長碼表內。';
comment on column public.doctors.export_code is
  '匯出用數字碼，對應部長碼表的 Doctor_ID（顏v=1、蒲v=2）。';
comment on column public.icd_codes.export_code is
  '匯出用數字碼，對應部長碼表的 Diagnosis（L730=1、L910=2、L905=3）。ICD-9 對照碼沿用同一個數字。';
comment on column public.treatment_types.export_code is
  '匯出用數字碼。部長 2026-08 碼表未定義治療類型編碼，目前全部留 null，保留欄位供日後使用。';

-- ===== ② 人形圖熱區改為 22 碼 =====

-- 2a) 舊熱區全部停用（不刪，既有 90 筆病灶仍指向它們，且外鍵擋刪）
--     並逐一回填 export_code，讓現有資料仍匯得出數字碼。
update public.body_part_zones set active = false;

update public.body_part_zones set export_code = m.code
from (values
  -- 正面
  ('front_head',        22), ('front_ear_l',       3), ('front_ear_r',       4),
  ('front_neck',         5), ('front_chest',       6), ('front_shoulder_l', 22),
  ('front_shoulder_r',  22), ('front_upperarm_l',  9), ('front_upperarm_r', 10),
  ('front_forearm_l',   22), ('front_forearm_r',  22), ('front_hand_l',     22),
  ('front_hand_r',      22), ('front_abdomen',    16), ('front_thigh_l',    18),
  ('front_thigh_r',     19), ('front_calf_l',     20), ('front_calf_r',     21),
  ('front_neck_side_l',  5), ('front_neck_side_r', 5), ('front_clavicle_l', 22),
  ('front_clavicle_r',  22), ('front_axilla_l',   22), ('front_axilla_r',   22),
  ('front_elbow_l',     22), ('front_elbow_r',    22), ('front_wrist_l',    22),
  ('front_wrist_r',     22), ('front_groin_l',    22), ('front_groin_r',    22),
  ('front_pubic',       17), ('front_knee_l',     22), ('front_knee_r',     22),
  ('front_ankle_l',     22), ('front_ankle_r',    22),
  -- 背面
  ('back_head',         22), ('back_neck',         5), ('back_scapular_l',  14),
  ('back_scapular_r',   15), ('back_upper',       11), ('back_lower',       22),
  ('back_upperarm_l',    9), ('back_upperarm_r',  10), ('back_forearm_l',   22),
  ('back_forearm_r',    22), ('back_buttocks',    22), ('back_thigh_l',     18),
  ('back_thigh_r',      19), ('back_calf_l',      20), ('back_calf_r',      21),
  ('back_elbow_l',      22), ('back_elbow_r',     22), ('back_wrist_l',     22),
  ('back_wrist_r',      22), ('back_knee_l',      22), ('back_knee_r',      22),
  ('back_ankle_l',      22), ('back_ankle_r',     22),
  -- 頭頸特寫
  ('head_ear_helix_l',   1), ('head_ear_helix_r',  2), ('head_ear_lobe_l',   3),
  ('head_ear_lobe_r',    4), ('head_ear_post_l',  22), ('head_ear_post_r',  22)
) as m(zone_key, code)
where public.body_part_zones.zone_key = m.zone_key;

-- 註：舊的「左耳」「右耳」是籠統熱區（舊資料匯入時 ear lobe / ear helix / bilateral earlobe
-- 都掛在上面），無法判斷是 helix 還是 earlobe。此處暫代為 earlobe（3/4，臨床上最常見的耳部
-- 蟹足腫位置），並由匯出程式一律列進「未能對應清單」附帶原始部位文字供人工校正。

-- 2b) 新增 22 碼熱區 ＋ 左/右耳後（共 24 個）
--     左右側採「解剖慣例」：正面/頭頸特寫檢視中，病人的左（L't）畫在畫面右側；
--     背面檢視中病人的左就在畫面左側。座標定義在 src/lib/bodyZones.ts。
insert into public.body_part_zones (zone_key, view, display_name, export_label, export_code, dose_category, sort_order, active) values
  -- 頭頸特寫（耳部，保留特寫視圖是為了讓耳朵熱區在手機上點得到，2026-07-28 部長反映過）
  ('k22_01_helix_l',     'head',  '左耳廓',     'L''t helix',                    1, 'ear',            1, true),
  ('k22_02_helix_r',     'head',  '右耳廓',     'R''t helix',                    2, 'ear',            2, true),
  ('k22_03_earlobe_l',   'head',  '左耳垂',     'L''t earlobe',                  3, 'ear',            3, true),
  ('k22_04_earlobe_r',   'head',  '右耳垂',     'R''t earlobe',                  4, 'ear',            4, true),
  ('k22_ear_post_l',     'head',  '左耳後',     'other (postauricular, L''t)',  22, 'ear',            5, true),
  ('k22_ear_post_r',     'head',  '右耳後',     'other (postauricular, R''t)',  22, 'ear',            6, true),
  -- 正面
  ('k22_05_jaw_neck',    'front', '下顎/頸部',  'lower jaw/ neck region',        5, 'other',          5, true),
  ('k22_06_ant_chest',   'front', '前胸/胸壁',  'anterior chest/ chest wall',    6, 'chest_scapular', 6, true),
  ('k22_07_chest_l',     'front', '左前胸',     'L''t chest',                    7, 'chest_scapular', 7, true),
  ('k22_08_chest_r',     'front', '右前胸',     'R''t chest',                    8, 'chest_scapular', 8, true),
  ('k22_09_upperarm_l',  'front', '左上臂',     'L''t upper arm',                9, 'other',          9, true),
  ('k22_10_upperarm_r',  'front', '右上臂',     'R''t upper arm',               10, 'other',         10, true),
  ('k22_16_abdomen',     'front', '腹部',       'Abdomen',                      16, 'other',         16, true),
  ('k22_17_suprapubic',  'front', '恥骨上區',   'suprapubic',                   17, 'other',         17, true),
  ('k22_18_thigh_l',     'front', '左大腿外側', 'L''t lateral thigh',            18, 'other',         18, true),
  ('k22_19_thigh_r',     'front', '右大腿外側', 'R''t lateral thigh',            19, 'other',         19, true),
  ('k22_20_lowerleg_l',  'front', '左小腿前側', 'L''t anterior lower leg',       20, 'other',         20, true),
  ('k22_21_lowerleg_r',  'front', '右小腿前側', 'R''t anterior lower leg',       21, 'other',         21, true),
  -- 背面
  ('k22_11_upper_back',  'back',  '上背/背部',  'upper back/ back',             11, 'chest_scapular', 11, true),
  ('k22_12_back_l',      'back',  '左背',       'L''t back',                    12, 'chest_scapular', 12, true),
  ('k22_13_back_r',      'back',  '右背',       'R''t back',                    13, 'chest_scapular', 13, true),
  ('k22_14_scapular_l',  'back',  '左肩胛',     'L''t scapular',                14, 'chest_scapular', 14, true),
  ('k22_15_scapular_r',  'back',  '右肩胛',     'R''t scapular',                15, 'chest_scapular', 15, true),
  -- 其他（非熱區，收案介面以按鈕呈現並要求填自由文字部位說明）
  ('k22_22_other',       'front', '其他部位',   'other',                        22, 'other',         22, true)
on conflict (zone_key) do update set
  view         = excluded.view,
  display_name = excluded.display_name,
  export_label = excluded.export_label,
  export_code  = excluded.export_code,
  dose_category= excluded.dose_category,
  sort_order   = excluded.sort_order,
  active       = excluded.active;

-- ===== ③ 發生原因補齊到部長碼表的 8 項 =====
-- 部長碼表：1外傷 2燒傷 3手術切口 4疫苗接種 5耳洞穿刺 6痤瘡 7自發 8其他
-- 現有清單缺「耳洞穿刺」（docx 第 13 點明確要求新增）與「自發」。
insert into public.case_intake_option_lists (category, label, sort_order) values
  ('onset_cause', '耳洞穿刺', 5),
  ('onset_cause', '自發',     7)
on conflict do nothing;

update public.case_intake_option_lists set export_code = m.code, sort_order = m.code
from (values
  ('外傷', 1), ('燒傷', 2), ('手術切口', 3), ('疫苗接種', 4),
  ('耳洞穿刺', 5), ('痤瘡', 6), ('自發', 7), ('其他', 8)
) as m(label, code)
where public.case_intake_option_lists.category = 'onset_cause'
  and public.case_intake_option_lists.label = m.label;

-- ===== 醫師代碼與 ICD 診斷碼 =====
update public.doctors set export_code = 1 where code = 'YEN';  -- 顏v
update public.doctors set export_code = 2 where code = 'PU';   -- 蒲v

-- ICD-9 對照碼沿用其 ICD-10 對應碼的數字（1=Acne keloid、2=Hypertrophic scar、3=Scar/fibrosis）
update public.icd_codes set export_code = 1 where code in ('L730', '7061');
update public.icd_codes set export_code = 2 where code in ('L910', '7014');
update public.icd_codes set export_code = 3 where code in ('L905', '7092');
-- I10 / E11.9 是共病參考碼，不在部長碼表內，維持 null
