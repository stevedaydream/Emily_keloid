// 人形部位圖幾何座標（簡化風格化人形，非解剖寫實圖）。
// 座標對應資料庫 body_part_zones.zone_key，viewBox 為 0 0 200 320。
export type ZoneShape =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; rx?: number };

export const BODY_ZONE_SHAPES: Record<string, ZoneShape> = {
  // 正面
  front_head: { kind: "circle", cx: 100, cy: 28, r: 20 },
  front_ear_l: { kind: "circle", cx: 78, cy: 30, r: 7 },
  front_ear_r: { kind: "circle", cx: 122, cy: 30, r: 7 },
  front_neck: { kind: "rect", x: 90, y: 46, w: 20, h: 14 },
  front_shoulder_l: { kind: "rect", x: 45, y: 60, w: 22, h: 20, rx: 6 },
  front_shoulder_r: { kind: "rect", x: 133, y: 60, w: 22, h: 20, rx: 6 },
  front_chest: { kind: "rect", x: 67, y: 60, w: 66, h: 42, rx: 6 },
  front_abdomen: { kind: "rect", x: 67, y: 104, w: 66, h: 42, rx: 6 },
  front_upperarm_l: { kind: "rect", x: 24, y: 80, w: 20, h: 55, rx: 8 },
  front_upperarm_r: { kind: "rect", x: 156, y: 80, w: 20, h: 55, rx: 8 },
  front_forearm_l: { kind: "rect", x: 14, y: 138, w: 20, h: 52, rx: 8 },
  front_forearm_r: { kind: "rect", x: 166, y: 138, w: 20, h: 52, rx: 8 },
  front_hand_l: { kind: "rect", x: 10, y: 192, w: 22, h: 22, rx: 8 },
  front_hand_r: { kind: "rect", x: 168, y: 192, w: 22, h: 22, rx: 8 },
  front_thigh_l: { kind: "rect", x: 68, y: 148, w: 30, h: 68, rx: 8 },
  front_thigh_r: { kind: "rect", x: 102, y: 148, w: 30, h: 68, rx: 8 },
  front_calf_l: { kind: "rect", x: 70, y: 218, w: 26, h: 68, rx: 8 },
  front_calf_r: { kind: "rect", x: 104, y: 218, w: 26, h: 68, rx: 8 },

  // 背面
  back_head: { kind: "circle", cx: 100, cy: 28, r: 20 },
  back_neck: { kind: "rect", x: 90, y: 46, w: 20, h: 14 },
  back_scapular_l: { kind: "rect", x: 56, y: 60, w: 33, h: 38, rx: 6 },
  back_scapular_r: { kind: "rect", x: 111, y: 60, w: 33, h: 38, rx: 6 },
  back_upper: { kind: "rect", x: 89, y: 60, w: 22, h: 38, rx: 6 },
  back_lower: { kind: "rect", x: 67, y: 98, w: 66, h: 32, rx: 6 },
  back_buttocks: { kind: "rect", x: 67, y: 130, w: 66, h: 30, rx: 8 },
  back_upperarm_l: { kind: "rect", x: 24, y: 80, w: 20, h: 55, rx: 8 },
  back_upperarm_r: { kind: "rect", x: 156, y: 80, w: 20, h: 55, rx: 8 },
  back_forearm_l: { kind: "rect", x: 14, y: 138, w: 20, h: 52, rx: 8 },
  back_forearm_r: { kind: "rect", x: 166, y: 138, w: 20, h: 52, rx: 8 },
  back_thigh_l: { kind: "rect", x: 68, y: 160, w: 30, h: 66, rx: 8 },
  back_thigh_r: { kind: "rect", x: 102, y: 160, w: 30, h: 66, rx: 8 },
  back_calf_l: { kind: "rect", x: 70, y: 226, w: 26, h: 66, rx: 8 },
  back_calf_r: { kind: "rect", x: 104, y: 226, w: 26, h: 66, rx: 8 },
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
