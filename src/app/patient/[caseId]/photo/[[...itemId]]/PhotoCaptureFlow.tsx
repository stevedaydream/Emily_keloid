"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BodyDiagram from "@/components/BodyDiagram";
import CameraCapture from "./CameraCapture";

type Zone = { id: string; zone_key: string; view: "front" | "back"; display_name: string; dose_category: string };

export default function PhotoCaptureFlow({
  caseId,
  itemId,
  zones,
  currentZoneKey,
  sex,
}: {
  caseId: string;
  itemId: string;
  zones: Zone[];
  currentZoneKey?: string | null;
  sex?: string | null;
}) {
  const [selected, setSelected] = useState<Zone | null>(null);
  const router = useRouter();

  if (!selected) {
    return (
      <div className="mx-auto max-w-sm space-y-2">
        <h1 className="text-center text-lg font-semibold text-slate-800">部位標記與拍照</h1>
        <BodyDiagram zones={zones} currentZoneKey={currentZoneKey} onSelect={setSelected} sex={sex} />
      </div>
    );
  }

  return (
    <CameraCapture
      caseId={caseId}
      itemId={itemId}
      zoneKey={selected.zone_key}
      zoneDisplayName={selected.display_name}
      doseCategory={selected.dose_category}
      onBack={() => setSelected(null)}
      onDone={() => router.push(`/cases/${caseId}`)}
    />
  );
}
