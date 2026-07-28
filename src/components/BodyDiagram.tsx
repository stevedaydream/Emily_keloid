"use client";

import { useState } from "react";
import {
  bodyZoneShapesFor,
  silhouetteImageFor,
  viewBoxFor,
  BODY_VIEW_LABEL,
  DOSE_CATEGORY_COLOR,
  DOSE_CATEGORY_LABEL,
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

  const visibleZones = zones.filter((z) => z.view === view);
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
    </div>
  );
}
