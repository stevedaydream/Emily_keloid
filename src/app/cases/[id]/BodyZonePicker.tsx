"use client";

import { useState } from "react";
import BodyDiagram from "@/components/BodyDiagram";
import SubmitButton from "@/components/ui/SubmitButton";
import { setCaseBodyZoneAction } from "./actions";

type Zone = { id: string; zone_key: string; view: "front" | "back"; display_name: string; dose_category: string };

export default function BodyZonePicker({
  caseId,
  zones,
  currentZoneKey,
  sex,
}: {
  caseId: string;
  zones: Zone[];
  currentZoneKey?: string | null;
  sex?: string | null;
}) {
  const [selected, setSelected] = useState<Zone | null>(null);

  return (
    <div className="mt-2 space-y-2">
      <BodyDiagram zones={zones} currentZoneKey={currentZoneKey} onSelect={setSelected} sex={sex} />
      <form action={setCaseBodyZoneAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input type="hidden" name="case_id" value={caseId} />
        <input type="hidden" name="zone_id" value={selected?.id ?? ""} />
        <SubmitButton variant="outline" disabled={!selected} pendingText="設定中…">
          {selected ? `設定為主要部位：${selected.display_name}` : "請先在上方人形圖點選部位"}
        </SubmitButton>
      </form>
    </div>
  );
}
