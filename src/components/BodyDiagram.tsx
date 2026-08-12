"use client";

import { useState } from "react";
import {
  bodyZoneShapesFor,
  silhouetteImageFor,
  viewBoxFor,
  BODY_VIEW_LABEL,
  DOSE_CATEGORY_COLOR,
  DOSE_CATEGORY_LABEL,
  VIEW_LATERALITY_HINT,
  OTHER_ZONE_KEY,
  type BodyView,
} from "@/lib/bodyZones";

type Zone = { id: string; zone_key: string; view: BodyView; display_name: string; dose_category: string };

const VIEWS: BodyView[] = ["front", "back", "head"];

export default function BodyDiagram({
  zones,
  currentZoneKey,
  onSelect,
  sex,
}: {
  zones: Zone[];
  currentZoneKey?: string | null;
  onSelect: (zone: Zone) => void;
  sex?: string | null;
}) {
  const [view, setView] = useState<BodyView>("front");
  const [hovered, setHovered] = useState<string | null>(null);

  // 「其他部位」不是圖上的熱區（22 碼裡沒有對應的身體位置），改用圖下方的按鈕呈現，
  // 且不分檢視都看得到——肩、前臂、手、臀、關節、腋下、鼠蹊等部位都只能走這條路。
  const otherZone = zones.find((z) => z.zone_key === OTHER_ZONE_KEY);
  const visibleZones = zones.filter((z) => z.view === view && z.zone_key !== OTHER_ZONE_KEY);
  const hoveredZone = zones.find((z) => z.zone_key === hovered);
  const zoneShapes = bodyZoneShapesFor(sex);
  // 頭頸特寫是同一張正面圖的局部放大，熱區線寬要跟著縮小，否則放大後外框會粗得蓋住色塊。
  const strokeScale = view === "head" ? 0.2 : 1;

  return (
    <div className="rounded-lg border border-brand-100 bg-paper-raised p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="whitespace-nowrap text-sm font-semibold text-brand-900">請點選蟹足腫部位</h2>
        <div className="flex shrink-0 overflow-hidden rounded-md border border-brand-200 text-xs">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`whitespace-nowrap px-3 py-1 ${view === v ? "bg-brand-700 text-white" : "bg-white text-ink/70"}`}
            >
              {BODY_VIEW_LABEL[v]}
            </button>
          ))}
        </div>
      </div>

      {/* 左右提示：正面圖畫的是「面對病人」，畫面左側其實是病人的右側，不寫清楚很容易點錯邊 */}
      <p className="mb-2 rounded bg-brand-50 px-2 py-1 text-center text-[11px] leading-snug text-brand-800">
        {VIEW_LATERALITY_HINT[view]}
      </p>

      <svg viewBox={viewBoxFor(view, sex)} className="mx-auto h-80 w-full max-w-xs touch-manipulation">
        <image href={silhouetteImageFor(view, sex)} x={0} y={0} width={940} height={1136} preserveAspectRatio="xMidYMid meet" />
        {visibleZones.map((z) => {
          const shape = zoneShapes[z.zone_key];
          if (!shape) return null;
          const isCurrent = z.zone_key === currentZoneKey;
          const color = DOSE_CATEGORY_COLOR[z.dose_category] ?? "#94a3b8";
          const commonProps = {
            fill: isCurrent ? color : `${color}55`,
            stroke: color,
            strokeWidth: (isCurrent ? 2.5 : 1) * strokeScale,
            onClick: () => onSelect(z),
            onMouseEnter: () => setHovered(z.zone_key),
            onMouseLeave: () => setHovered(null),
            onTouchStart: () => setHovered(z.zone_key),
            className: "cursor-pointer transition-opacity hover:opacity-80",
          };
          if (shape.kind === "circle") {
            return <circle key={z.zone_key} {...commonProps} cx={shape.cx} cy={shape.cy} r={shape.r} />;
          }
          return <rect key={z.zone_key} {...commonProps} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx ?? 4} />;
        })}
      </svg>

      <div className="mt-2 h-5 text-center text-xs text-ink/50">
        {hoveredZone
          ? `${hoveredZone.display_name}（${DOSE_CATEGORY_LABEL[hoveredZone.dose_category]}）`
          : view === "head"
            ? "耳朵細分：耳廓／耳垂／耳後，點選圖上區塊"
            : "點選圖上區塊選擇部位"}
      </div>

      {otherZone ? (
        <div className="mt-2 border-t border-brand-100 pt-2 text-center">
          <button
            type="button"
            onClick={() => onSelect(otherZone)}
            className={`w-full rounded-md border px-3 py-2 text-xs ${
              currentZoneKey === OTHER_ZONE_KEY
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-brand-200 bg-white text-ink/70"
            }`}
          >
            其他部位（圖上沒有的位置）
          </button>
          <p className="mt-1 text-[11px] leading-snug text-ink/45">
            肩、前臂、手、臀、肘/腕/膝/踝、腋下、鼠蹊等：選這個並在下方部位欄填寫實際位置。
            放射治療劑量會套用「其他部位」15Gy×2。
          </p>
        </div>
      ) : null}
    </div>
  );
}
