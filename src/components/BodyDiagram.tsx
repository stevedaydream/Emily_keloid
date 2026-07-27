"use client";

import { useState } from "react";
import { bodyZoneShapesFor, silhouetteImageFor, BODY_DIAGRAM_VIEWBOX, DOSE_CATEGORY_COLOR, DOSE_CATEGORY_LABEL } from "@/lib/bodyZones";

type Zone = { id: string; zone_key: string; view: "front" | "back"; display_name: string; dose_category: string };

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
  const [view, setView] = useState<"front" | "back">("front");
  const [hovered, setHovered] = useState<string | null>(null);

  const visibleZones = zones.filter((z) => z.view === view);
  const hoveredZone = zones.find((z) => z.zone_key === hovered);
  const zoneShapes = bodyZoneShapesFor(sex);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="whitespace-nowrap text-sm font-semibold text-slate-700">請點選蟹足腫部位</h2>
        <div className="flex shrink-0 overflow-hidden rounded-md border border-slate-300 text-xs">
          <button
            type="button"
            onClick={() => setView("front")}
            className={`whitespace-nowrap px-3 py-1 ${view === "front" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
          >
            正面
          </button>
          <button
            type="button"
            onClick={() => setView("back")}
            className={`whitespace-nowrap px-3 py-1 ${view === "back" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
          >
            背面
          </button>
        </div>
      </div>

      <svg viewBox={BODY_DIAGRAM_VIEWBOX} className="mx-auto h-80 w-full max-w-xs touch-manipulation">
        <image href={silhouetteImageFor(view, sex)} x={0} y={0} width={940} height={1136} preserveAspectRatio="xMidYMid meet" />
        {visibleZones.map((z) => {
          const shape = zoneShapes[z.zone_key];
          if (!shape) return null;
          const isCurrent = z.zone_key === currentZoneKey;
          const color = DOSE_CATEGORY_COLOR[z.dose_category] ?? "#94a3b8";
          const commonProps = {
            key: z.zone_key,
            fill: isCurrent ? color : `${color}55`,
            stroke: color,
            strokeWidth: isCurrent ? 2.5 : 1,
            onClick: () => onSelect(z),
            onMouseEnter: () => setHovered(z.zone_key),
            onMouseLeave: () => setHovered(null),
            onTouchStart: () => setHovered(z.zone_key),
            className: "cursor-pointer transition-opacity hover:opacity-80",
          };
          if (shape.kind === "circle") {
            return <circle {...commonProps} cx={shape.cx} cy={shape.cy} r={shape.r} />;
          }
          return <rect {...commonProps} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx ?? 4} />;
        })}
      </svg>

      <div className="mt-2 h-5 text-center text-xs text-slate-500">
        {hoveredZone
          ? `${hoveredZone.display_name}（${DOSE_CATEGORY_LABEL[hoveredZone.dose_category]}）`
          : "點選圖上區塊選擇部位"}
      </div>
    </div>
  );
}
