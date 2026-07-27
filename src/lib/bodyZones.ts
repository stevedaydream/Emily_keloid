// 人形部位圖幾何座標。viewBox 為 0 0 940 1136，對齊 public/body-diagram/ 下的輪廓蒙板圖。
// 2026-07-27 依使用者提供的 Gemini 生成人形圖（2x2：男/女×正/背面）實測像素邊界校正座標，
// 男/女各自獨立一套座標（因裁切後兩張圖的人物比例、水平中心點、姿勢皆不同，無法共用同一套數字）。
// 座標對應資料庫 body_part_zones.zone_key。仍為簡化幾何形狀（非逐像素精細輪廓貼合），足供點選熱區使用。
export type ZoneShape =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; rx?: number };

export type Sex = "M" | "F";

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

  // 背面（輪廓圖水平中心 cx=465，與正面圖裁切位置不同，故中心點不同）
  back_head: { kind: "circle", cx: 465, cy: 136, r: 61 },
  back_neck: { kind: "rect", x: 430, y: 197, w: 70, h: 50 },
  back_scapular_l: { kind: "rect", x: 290, y: 247, w: 150, h: 180, rx: 20 },
  back_scapular_r: { kind: "rect", x: 490, y: 247, w: 150, h: 180, rx: 20 },
  back_upper: { kind: "rect", x: 440, y: 247, w: 50, h: 180, rx: 16 },
  back_lower: { kind: "rect", x: 340, y: 427, w: 250, h: 230, rx: 20 },
  back_buttocks: { kind: "rect", x: 350, y: 706, w: 230, h: 110, rx: 24 },
  back_upperarm_l: { kind: "rect", x: 280, y: 257, w: 65, h: 180, rx: 22 },
  back_upperarm_r: { kind: "rect", x: 585, y: 257, w: 65, h: 180, rx: 22 },
  back_forearm_l: { kind: "rect", x: 250, y: 437, w: 60, h: 270, rx: 20 },
  back_forearm_r: { kind: "rect", x: 620, y: 437, w: 60, h: 270, rx: 20 },
  back_thigh_l: { kind: "rect", x: 340, y: 816, w: 125, h: 210, rx: 20 },
  back_thigh_r: { kind: "rect", x: 465, y: 816, w: 125, h: 210, rx: 20 },
  back_calf_l: { kind: "rect", x: 350, y: 1026, w: 115, h: 74, rx: 20 },
  back_calf_r: { kind: "rect", x: 465, y: 1026, w: 115, h: 74, rx: 20 },
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

  // 背面（輪廓圖水平中心 cx=500）
  back_head: { kind: "circle", cx: 500, cy: 157, r: 65 },
  back_neck: { kind: "rect", x: 465, y: 225, w: 70, h: 45 },
  back_scapular_l: { kind: "rect", x: 350, y: 270, w: 128, h: 170, rx: 20 },
  back_scapular_r: { kind: "rect", x: 522, y: 270, w: 128, h: 170, rx: 20 },
  back_upper: { kind: "rect", x: 478, y: 270, w: 44, h: 170, rx: 16 },
  back_lower: { kind: "rect", x: 370, y: 440, w: 260, h: 245, rx: 20 },
  back_buttocks: { kind: "rect", x: 390, y: 685, w: 220, h: 140, rx: 24 },
  back_upperarm_l: { kind: "rect", x: 260, y: 270, w: 65, h: 180, rx: 22 },
  back_upperarm_r: { kind: "rect", x: 675, y: 270, w: 65, h: 180, rx: 22 },
  back_forearm_l: { kind: "rect", x: 230, y: 450, w: 60, h: 250, rx: 20 },
  back_forearm_r: { kind: "rect", x: 710, y: 450, w: 60, h: 250, rx: 20 },
  back_thigh_l: { kind: "rect", x: 395, y: 825, w: 105, h: 140, rx: 20 },
  back_thigh_r: { kind: "rect", x: 500, y: 825, w: 105, h: 140, rx: 20 },
  back_calf_l: { kind: "rect", x: 405, y: 965, w: 95, h: 126, rx: 20 },
  back_calf_r: { kind: "rect", x: 500, y: 965, w: 95, h: 126, rx: 20 },
};

export function bodyZoneShapesFor(sex?: string | null): Record<string, ZoneShape> {
  return resolveSex(sex) === "F" ? BODY_ZONE_SHAPES_FEMALE : BODY_ZONE_SHAPES_MALE;
}

// 向下相容：未指定性別時的預設（男性）座標表。
export const BODY_ZONE_SHAPES = BODY_ZONE_SHAPES_MALE;

// 輪廓蒙板圖片（供 BodyDiagram.tsx 當背景參照圖），依性別切換男/女版本。
export function silhouetteImageFor(view: "front" | "back", sex?: string | null): string {
  return resolveSex(sex) === "F" ? `/body-diagram/${view}-female.png` : `/body-diagram/${view}.png`;
}
export const BODY_DIAGRAM_VIEWBOX = "0 0 940 1136";

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
