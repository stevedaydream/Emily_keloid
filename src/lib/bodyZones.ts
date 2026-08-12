// 人形部位圖幾何座標。viewBox 為 0 0 940 1136，對齊 public/body-diagram/ 下的輪廓蒙板圖。
// 2026-07-27 依使用者提供的 Gemini 生成人形圖（2x2：男/女×正/背面）實測像素邊界校正座標，
// 男/女各自獨立一套座標（因裁切後兩張圖的人物比例、水平中心點、姿勢皆不同，無法共用同一套數字）。
// 座標對應資料庫 body_part_zones.zone_key。仍為簡化幾何形狀（非逐像素精細輪廓貼合），足供點選熱區使用。
export type ZoneShape =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; rx?: number };

export type Sex = "M" | "F";

// 'head' 是頭頸特寫檢視：沿用正面輪廓圖，只是把 SVG viewBox 裁切到頭頸範圍放大，
// 讓耳朵細分（耳垂/耳廓/耳後）的熱區在手機上大到按得到（2026-07-28 部長反映耳朵很難按）。
export type BodyView = "front" | "back" | "head";

function resolveSex(sex?: string | null): Sex {
  return sex === "F" ? "F" : "M"; // 未填/其他一律預設男性輪廓
}

const BODY_ZONE_SHAPES_MALE: Record<string, ZoneShape> = {
  // 正面（輪廓圖水平中心 cx=528）
  front_head: { kind: "circle", cx: 528, cy: 75, r: 58 },
  front_ear_l: { kind: "circle", cx: 492, cy: 84, r: 16 },
  front_ear_r: { kind: "circle", cx: 564, cy: 84, r: 16 },
  front_neck: { kind: "rect", x: 496, y: 139, w: 64, h: 42 },
  front_shoulder_l: { kind: "rect", x: 330, y: 181, w: 110, h: 88, rx: 20 },
  front_shoulder_r: { kind: "rect", x: 616, y: 181, w: 110, h: 88, rx: 20 },
  front_chest: { kind: "rect", x: 413, y: 249, w: 230, h: 170, rx: 20 },
  front_abdomen: { kind: "rect", x: 423, y: 419, w: 210, h: 170, rx: 20 },
  front_upperarm_l: { kind: "rect", x: 345, y: 249, w: 65, h: 170, rx: 22 },
  front_upperarm_r: { kind: "rect", x: 646, y: 249, w: 65, h: 170, rx: 22 },
  front_forearm_l: { kind: "rect", x: 315, y: 419, w: 60, h: 150, rx: 20 },
  front_forearm_r: { kind: "rect", x: 681, y: 419, w: 60, h: 150, rx: 20 },
  front_hand_l: { kind: "rect", x: 305, y: 569, w: 55, h: 80, rx: 20 },
  front_hand_r: { kind: "rect", x: 696, y: 569, w: 55, h: 80, rx: 20 },
  front_thigh_l: { kind: "rect", x: 423, y: 649, w: 105, h: 210, rx: 20 },
  front_thigh_r: { kind: "rect", x: 528, y: 649, w: 105, h: 210, rx: 20 },
  front_calf_l: { kind: "rect", x: 433, y: 909, w: 95, h: 160, rx: 20 },
  front_calf_r: { kind: "rect", x: 528, y: 909, w: 95, h: 160, rx: 20 },

  // 正面關節與新增部位（2026-07-28 部長指示）。座標不是憑既有矩形推算，而是用 sharp 逐列掃描
  // front.png 的填色範圍實測而來：例如 y=419 該列有「左臂 359-412／軀幹／右臂 645-698」三段，
  // 肘就取左右臂段的中心；半徑取該段寬度的一半略小，避免圓形超出肢體輪廓。
  front_neck_side_l: { kind: "circle", cx: 494, cy: 168, r: 18 },
  front_neck_side_r: { kind: "circle", cx: 564, cy: 168, r: 18 },
  front_clavicle_l: { kind: "circle", cx: 482, cy: 238, r: 22 },
  front_clavicle_r: { kind: "circle", cx: 576, cy: 238, r: 22 },
  front_axilla_l: { kind: "circle", cx: 428, cy: 290, r: 26 },
  front_axilla_r: { kind: "circle", cx: 628, cy: 290, r: 26 },
  front_elbow_l: { kind: "circle", cx: 386, cy: 419, r: 26 },
  front_elbow_r: { kind: "circle", cx: 672, cy: 419, r: 26 },
  front_wrist_l: { kind: "circle", cx: 380, cy: 566, r: 20 },
  front_wrist_r: { kind: "circle", cx: 677, cy: 566, r: 20 },
  front_groin_l: { kind: "circle", cx: 478, cy: 566, r: 24 },
  front_groin_r: { kind: "circle", cx: 580, cy: 566, r: 24 },
  front_pubic: { kind: "circle", cx: 529, cy: 546, r: 26 },
  front_knee_l: { kind: "circle", cx: 455, cy: 884, r: 30 },
  front_knee_r: { kind: "circle", cx: 603, cy: 884, r: 30 },
  front_ankle_l: { kind: "circle", cx: 456, cy: 1010, r: 20 },
  front_ankle_r: { kind: "circle", cx: 601, cy: 1010, r: 20 },

  // 頭頸特寫（沿用正面圖座標，檢視時把 viewBox 裁到頭部放大 ~7 倍）。
  // 男性頭部實測：y=100 這一列的填色範圍是 482-575（中心 529），耳朵三區沿頭部左右緣由上而下排。
  head_ear_helix_l: { kind: "circle", cx: 489, cy: 62, r: 13 },
  head_ear_helix_r: { kind: "circle", cx: 569, cy: 62, r: 13 },
  head_ear_lobe_l: { kind: "circle", cx: 492, cy: 112, r: 13 },
  head_ear_lobe_r: { kind: "circle", cx: 566, cy: 112, r: 13 },
  head_ear_post_l: { kind: "circle", cx: 480, cy: 88, r: 11 },
  head_ear_post_r: { kind: "circle", cx: 578, cy: 88, r: 11 },

  // 背面（輪廓圖水平中心 cx=466）。2026-07-28 全部依 back.png 逐列掃描結果重新校正：
  // 舊座標的手臂整體外偏約 40px、腿部整體低約 180px（實測腿在 y≈600 就分開，舊值寫 816），
  // 加關節熱區時才發現，一併修正，zone_key 不變、資料庫不需異動。
  back_head: { kind: "circle", cx: 466, cy: 138, r: 62 },
  back_neck: { kind: "rect", x: 432, y: 198, w: 68, h: 58 },
  back_scapular_l: { kind: "rect", x: 370, y: 270, w: 80, h: 160, rx: 18 },
  back_scapular_r: { kind: "rect", x: 482, y: 270, w: 80, h: 160, rx: 18 },
  back_upper: { kind: "rect", x: 450, y: 270, w: 32, h: 160, rx: 12 },
  back_lower: { kind: "rect", x: 375, y: 430, w: 180, h: 110, rx: 18 },
  back_buttocks: { kind: "rect", x: 368, y: 540, w: 197, h: 100, rx: 24 },
  back_upperarm_l: { kind: "rect", x: 296, y: 395, w: 56, h: 145, rx: 20 },
  back_upperarm_r: { kind: "rect", x: 580, y: 395, w: 56, h: 145, rx: 20 },
  back_forearm_l: { kind: "rect", x: 294, y: 555, w: 40, h: 125, rx: 16 },
  back_forearm_r: { kind: "rect", x: 596, y: 555, w: 40, h: 125, rx: 16 },
  back_thigh_l: { kind: "rect", x: 360, y: 640, w: 95, h: 240, rx: 20 },
  back_thigh_r: { kind: "rect", x: 475, y: 640, w: 95, h: 240, rx: 20 },
  back_calf_l: { kind: "rect", x: 372, y: 900, w: 64, h: 150, rx: 18 },
  back_calf_r: { kind: "rect", x: 494, y: 900, w: 64, h: 150, rx: 18 },

  // 背面關節（2026-07-28）
  back_elbow_l: { kind: "circle", cx: 320, cy: 545, r: 26 },
  back_elbow_r: { kind: "circle", cx: 611, cy: 545, r: 26 },
  back_wrist_l: { kind: "circle", cx: 305, cy: 665, r: 16 },
  back_wrist_r: { kind: "circle", cx: 628, cy: 665, r: 16 },
  back_knee_l: { kind: "circle", cx: 401, cy: 890, r: 26 },
  back_knee_r: { kind: "circle", cx: 529, cy: 890, r: 26 },
  back_ankle_l: { kind: "circle", cx: 405, cy: 1040, r: 18 },
  back_ankle_r: { kind: "circle", cx: 520, cy: 1040, r: 18 },

  // ===== 2026-08-12：部長 22 碼熱區（男性）=====
  // 左右側改採「解剖慣例」：正面／頭頸特寫是面對病人，所以病人的左（L't）畫在畫面右側；
  // 背面是背對病人，病人的左就在畫面左側（與舊座標同向，不需鏡射）。
  // 舊的 front_* 熱區是鏡像畫法（左畫在畫面左），已於本次一併停用，不再沿用其左右配置。
  //
  // 座標全部依 front.png / back.png 的逐列 alpha 掃描實測而來（每 40px 取一列量出人形的
  // x 區段），不是從舊座標推算。四肢刻意用「窄而貼合肢體中心」的矩形而非包住整條腿的寬矩形——
  // 寬矩形會把兩腿之間的空隙也算進熱區，點空白處會誤觸。
  // 頭頸特寫（沿用正面圖，viewBox 裁到頭部放大）。頭部實測：y=62 約 481-575、y=88 約 479-579、y=112 約 489-568。
  k22_02_helix_r: { kind: "circle", cx: 491, cy: 70, r: 12 },
  k22_01_helix_l: { kind: "circle", cx: 565, cy: 70, r: 12 },
  k22_ear_post_r: { kind: "circle", cx: 487, cy: 90, r: 10 },
  k22_ear_post_l: { kind: "circle", cx: 571, cy: 90, r: 10 },
  k22_04_earlobe_r: { kind: "circle", cx: 497, cy: 110, r: 12 },
  k22_03_earlobe_l: { kind: "circle", cx: 559, cy: 110, r: 12 },
  // 正面（輪廓中心 cx=528）。軀幹實測 y=400 為 447-610，胸部橫向切三等分：
  //   08 右胸(畫面左) / 06 前胸正中 / 07 左胸(畫面右)，互不重疊。
  k22_05_jaw_neck: { kind: "rect", x: 500, y: 120, w: 58, h: 82, rx: 16 },
  k22_08_chest_r: { kind: "rect", x: 448, y: 250, w: 52, h: 170, rx: 16 },
  k22_06_ant_chest: { kind: "rect", x: 502, y: 250, w: 52, h: 170, rx: 16 },
  k22_07_chest_l: { kind: "rect", x: 556, y: 250, w: 52, h: 170, rx: 16 },
  k22_10_upperarm_r: { kind: "rect", x: 372, y: 255, w: 44, h: 165, rx: 18 },
  k22_09_upperarm_l: { kind: "rect", x: 640, y: 255, w: 44, h: 165, rx: 18 },
  k22_16_abdomen: { kind: "rect", x: 445, y: 425, w: 170, h: 102, rx: 20 },
  k22_17_suprapubic: { kind: "circle", cx: 528, cy: 552, r: 25 },
  k22_19_thigh_r: { kind: "rect", x: 432, y: 620, w: 62, h: 200, rx: 20 },
  k22_18_thigh_l: { kind: "rect", x: 566, y: 620, w: 62, h: 200, rx: 20 },
  k22_21_lowerleg_r: { kind: "rect", x: 436, y: 900, w: 36, h: 130, rx: 14 },
  k22_20_lowerleg_l: { kind: "rect", x: 586, y: 900, w: 36, h: 130, rx: 14 },
  // 背面（輪廓中心 cx=466）。11 是脊椎正中帶，12/13 是中下背左右半，14/15 是兩側肩胛。
  k22_11_upper_back: { kind: "rect", x: 444, y: 262, w: 44, h: 170, rx: 14 },
  k22_12_back_l: { kind: "rect", x: 380, y: 436, w: 84, h: 104, rx: 18 },
  k22_13_back_r: { kind: "rect", x: 468, y: 436, w: 84, h: 104, rx: 18 },
  k22_14_scapular_l: { kind: "rect", x: 364, y: 270, w: 78, h: 160, rx: 18 },
  k22_15_scapular_r: { kind: "rect", x: 490, y: 270, w: 78, h: 160, rx: 18 },
  // k22_22_other 刻意沒有座標：它不是圖上的熱區，收案介面以「其他部位」按鈕呈現並要求填自由文字。
};

const BODY_ZONE_SHAPES_FEMALE: Record<string, ZoneShape> = {
  // 正面（輪廓圖水平中心 cx=492）
  front_head: { kind: "circle", cx: 492, cy: 87, r: 68 },
  front_ear_l: { kind: "circle", cx: 452, cy: 95, r: 15 },
  front_ear_r: { kind: "circle", cx: 532, cy: 95, r: 15 },
  front_neck: { kind: "rect", x: 460, y: 155, w: 64, h: 40 },
  front_shoulder_l: { kind: "rect", x: 300, y: 195, w: 105, h: 85, rx: 20 },
  front_shoulder_r: { kind: "rect", x: 579, y: 195, w: 105, h: 85, rx: 20 },
  front_chest: { kind: "rect", x: 397, y: 255, w: 190, h: 150, rx: 24 },
  front_abdomen: { kind: "rect", x: 417, y: 405, w: 150, h: 200, rx: 24 },
  front_upperarm_l: { kind: "rect", x: 310, y: 255, w: 60, h: 155, rx: 22 },
  front_upperarm_r: { kind: "rect", x: 614, y: 255, w: 60, h: 155, rx: 22 },
  front_forearm_l: { kind: "rect", x: 290, y: 410, w: 55, h: 140, rx: 20 },
  front_forearm_r: { kind: "rect", x: 639, y: 410, w: 55, h: 140, rx: 20 },
  front_hand_l: { kind: "rect", x: 280, y: 550, w: 50, h: 75, rx: 18 },
  front_hand_r: { kind: "rect", x: 654, y: 550, w: 50, h: 75, rx: 18 },
  front_thigh_l: { kind: "rect", x: 417, y: 625, w: 75, h: 230, rx: 20 },
  front_thigh_r: { kind: "rect", x: 492, y: 625, w: 75, h: 230, rx: 20 },
  front_calf_l: { kind: "rect", x: 427, y: 855, w: 65, h: 228, rx: 20 },
  front_calf_r: { kind: "rect", x: 492, y: 855, w: 65, h: 228, rx: 20 },

  // 正面關節與新增部位（2026-07-28）：以 front-female.png 的逐列掃描結果定位。
  front_neck_side_l: { kind: "circle", cx: 466, cy: 176, r: 16 },
  front_neck_side_r: { kind: "circle", cx: 518, cy: 176, r: 16 },
  front_clavicle_l: { kind: "circle", cx: 455, cy: 242, r: 20 },
  front_clavicle_r: { kind: "circle", cx: 529, cy: 242, r: 20 },
  front_axilla_l: { kind: "circle", cx: 413, cy: 292, r: 24 },
  front_axilla_r: { kind: "circle", cx: 571, cy: 292, r: 24 },
  front_elbow_l: { kind: "circle", cx: 371, cy: 410, r: 22 },
  front_elbow_r: { kind: "circle", cx: 613, cy: 410, r: 22 },
  front_wrist_l: { kind: "circle", cx: 357, cy: 548, r: 18 },
  front_wrist_r: { kind: "circle", cx: 627, cy: 548, r: 18 },
  front_groin_l: { kind: "circle", cx: 444, cy: 556, r: 22 },
  front_groin_r: { kind: "circle", cx: 540, cy: 556, r: 22 },
  front_pubic: { kind: "circle", cx: 492, cy: 534, r: 24 },
  front_knee_l: { kind: "circle", cx: 444, cy: 855, r: 28 },
  front_knee_r: { kind: "circle", cx: 539, cy: 855, r: 28 },
  front_ankle_l: { kind: "circle", cx: 454, cy: 1005, r: 18 },
  front_ankle_r: { kind: "circle", cx: 530, cy: 1005, r: 18 },

  // 頭頸特寫（女性頭部實測：y=110 這一列為 446-538，中心 492）
  head_ear_helix_l: { kind: "circle", cx: 452, cy: 74, r: 13 },
  head_ear_helix_r: { kind: "circle", cx: 532, cy: 74, r: 13 },
  head_ear_lobe_l: { kind: "circle", cx: 455, cy: 124, r: 13 },
  head_ear_lobe_r: { kind: "circle", cx: 529, cy: 124, r: 13 },
  head_ear_post_l: { kind: "circle", cx: 443, cy: 100, r: 11 },
  head_ear_post_r: { kind: "circle", cx: 541, cy: 100, r: 11 },

  // 背面（輪廓圖水平中心 cx=500）。同男性版本，2026-07-28 依 back-female.png 逐列掃描重新校正。
  back_head: { kind: "circle", cx: 500, cy: 150, r: 62 },
  back_neck: { kind: "rect", x: 462, y: 195, w: 76, h: 70 },
  back_scapular_l: { kind: "rect", x: 400, y: 275, w: 78, h: 155, rx: 18 },
  back_scapular_r: { kind: "rect", x: 522, y: 275, w: 78, h: 155, rx: 18 },
  back_upper: { kind: "rect", x: 480, y: 275, w: 40, h: 155, rx: 12 },
  back_lower: { kind: "rect", x: 410, y: 430, w: 180, h: 115, rx: 18 },
  back_buttocks: { kind: "rect", x: 400, y: 545, w: 200, h: 75, rx: 24 },
  back_upperarm_l: { kind: "rect", x: 358, y: 395, w: 60, h: 125, rx: 20 },
  back_upperarm_r: { kind: "rect", x: 582, y: 395, w: 60, h: 125, rx: 20 },
  back_forearm_l: { kind: "rect", x: 352, y: 530, w: 38, h: 150, rx: 16 },
  back_forearm_r: { kind: "rect", x: 610, y: 530, w: 38, h: 150, rx: 16 },
  back_thigh_l: { kind: "rect", x: 415, y: 620, w: 75, h: 260, rx: 20 },
  back_thigh_r: { kind: "rect", x: 512, y: 620, w: 75, h: 260, rx: 20 },
  back_calf_l: { kind: "rect", x: 425, y: 900, w: 53, h: 140, rx: 18 },
  back_calf_r: { kind: "rect", x: 522, y: 900, w: 53, h: 140, rx: 18 },

  // 背面關節（2026-07-28）：女性背面手臂較短，止於 y≈680。
  back_elbow_l: { kind: "circle", cx: 378, cy: 525, r: 22 },
  back_elbow_r: { kind: "circle", cx: 622, cy: 525, r: 22 },
  back_wrist_l: { kind: "circle", cx: 373, cy: 668, r: 16 },
  back_wrist_r: { kind: "circle", cx: 628, cy: 668, r: 16 },
  back_knee_l: { kind: "circle", cx: 451, cy: 890, r: 24 },
  back_knee_r: { kind: "circle", cx: 549, cy: 890, r: 24 },
  back_ankle_l: { kind: "circle", cx: 461, cy: 1045, r: 16 },
  back_ankle_r: { kind: "circle", cx: 539, cy: 1045, r: 16 },

  // ===== 2026-08-12：部長 22 碼熱區（女性）=====
  // 左右慣例同男性版本：正面／頭頸特寫 L't 在畫面右側，背面 L't 在畫面左側。
  // 同樣依 front-female.png / back-female.png 逐列 alpha 掃描實測。
  // ⚠️ 實測時發現舊的 front_upperarm_l/r 座標本身就是錯的（寫 x=310-370，實際手臂在 353-412，
  //    整整偏 40px），所以這裡沒有沿用舊值，全部重新量。
  // 頭頸特寫（女性頭部實測：y=74 約 450-534、y=92 約 450-534、y=110 約 452-533）
  k22_02_helix_r: { kind: "circle", cx: 460, cy: 74, r: 12 },
  k22_01_helix_l: { kind: "circle", cx: 524, cy: 74, r: 12 },
  k22_ear_post_r: { kind: "circle", cx: 458, cy: 92, r: 10 },
  k22_ear_post_l: { kind: "circle", cx: 526, cy: 92, r: 10 },
  k22_04_earlobe_r: { kind: "circle", cx: 464, cy: 110, r: 12 },
  k22_03_earlobe_l: { kind: "circle", cx: 521, cy: 110, r: 12 },
  // 正面（輪廓中心 cx=492）。軀幹最窄處實測 y=400 為 430-554，胸部橫向切三等分。
  k22_05_jaw_neck: { kind: "rect", x: 462, y: 120, w: 60, h: 78, rx: 16 },
  k22_08_chest_r: { kind: "rect", x: 431, y: 258, w: 40, h: 148, rx: 14 },
  k22_06_ant_chest: { kind: "rect", x: 472, y: 258, w: 40, h: 148, rx: 14 },
  k22_07_chest_l: { kind: "rect", x: 513, y: 258, w: 40, h: 148, rx: 14 },
  k22_10_upperarm_r: { kind: "rect", x: 363, y: 265, w: 36, h: 150, rx: 16 },
  k22_09_upperarm_l: { kind: "rect", x: 585, y: 265, w: 36, h: 150, rx: 16 },
  k22_16_abdomen: { kind: "rect", x: 418, y: 412, w: 148, h: 85, rx: 22 },
  k22_17_suprapubic: { kind: "circle", cx: 492, cy: 522, r: 25 },
  k22_19_thigh_r: { kind: "rect", x: 420, y: 618, w: 48, h: 195, rx: 18 },
  k22_18_thigh_l: { kind: "rect", x: 516, y: 618, w: 48, h: 195, rx: 18 },
  k22_21_lowerleg_r: { kind: "rect", x: 437, y: 900, w: 28, h: 125, rx: 12 },
  k22_20_lowerleg_l: { kind: "rect", x: 520, y: 900, w: 28, h: 125, rx: 12 },
  // 背面（女性輪廓中心 cx=500）。軀幹最窄處實測 y=400 為 429-571。
  k22_14_scapular_l: { kind: "rect", x: 431, y: 285, w: 47, h: 145, rx: 16 },
  k22_11_upper_back: { kind: "rect", x: 480, y: 280, w: 40, h: 155, rx: 14 },
  k22_15_scapular_r: { kind: "rect", x: 522, y: 285, w: 47, h: 145, rx: 16 },
  k22_12_back_l: { kind: "rect", x: 438, y: 436, w: 60, h: 108, rx: 18 },
  k22_13_back_r: { kind: "rect", x: 502, y: 436, w: 60, h: 108, rx: 18 },
};

/** 「其他部位」的 zone_key。它不是人形圖上的熱區，UI 以按鈕呈現並要求填自由文字部位說明。 */
export const OTHER_ZONE_KEY = "k22_22_other";

/**
 * 該檢視的左右標示文字（2026-08-12 加註）。
 * 正面／頭頸特寫是面對病人，畫面左側其實是病人的右側，不加註很容易點錯邊。
 */
export const VIEW_LATERALITY_HINT: Record<BodyView, string> = {
  front: "面對病人視角：畫面左＝病人右側，畫面右＝病人左側",
  head: "面對病人視角：畫面左＝病人右耳，畫面右＝病人左耳",
  back: "背對病人視角：畫面左＝病人左側，畫面右＝病人右側",
};

export function bodyZoneShapesFor(sex?: string | null): Record<string, ZoneShape> {
  return resolveSex(sex) === "F" ? BODY_ZONE_SHAPES_FEMALE : BODY_ZONE_SHAPES_MALE;
}

// 向下相容：未指定性別時的預設（男性）座標表。
export const BODY_ZONE_SHAPES = BODY_ZONE_SHAPES_MALE;

// 輪廓蒙板圖片（供 BodyDiagram.tsx 當背景參照圖），依性別切換男/女版本。
// 頭頸特寫沒有另外的圖，用的就是正面圖（差別只在 viewBox 裁切範圍）。
export function silhouetteImageFor(view: BodyView, sex?: string | null): string {
  const file = view === "head" ? "front" : view;
  return resolveSex(sex) === "F" ? `/body-diagram/${file}-female.png` : `/body-diagram/${file}.png`;
}

export const BODY_DIAGRAM_VIEWBOX = "0 0 940 1136";

// 頭頸特寫的裁切範圍（男/女輪廓圖的頭部位置不同，各自一組）。
// 高度從 1136 縮到約 190，等於把耳朵放大約 6 倍，熱區在手機上才有足夠的觸控面積。
const HEAD_VIEWBOX: Record<Sex, string> = {
  M: "455 15 150 165",
  F: "415 25 160 175",
};

export function viewBoxFor(view: BodyView, sex?: string | null): string {
  return view === "head" ? HEAD_VIEWBOX[resolveSex(sex)] : BODY_DIAGRAM_VIEWBOX;
}

export const BODY_VIEW_LABEL: Record<BodyView, string> = {
  front: "正面",
  back: "背面",
  head: "頭頸特寫",
};

export const DOSE_CATEGORY_COLOR: Record<string, string> = {
  chest_scapular: "#38bdf8", // sky
  ear: "#f59e0b", // amber
  other: "#94a3b8", // slate
};

export const DOSE_CATEGORY_LABEL: Record<string, string> = {
  chest_scapular: "胸/肩胛區",
  ear: "耳朵",
  other: "其他部位",
};

// 對齊蒙板形狀：沿用既有 body_site_masks 的三種蒙板風格，依劑量分類決定。
export function maskShapeForCategory(doseCategory: string): string {
  if (doseCategory === "ear") return "ear_outline";
  if (doseCategory === "chest_scapular") return "chest_outline";
  return "crosshair_ruler";
}
