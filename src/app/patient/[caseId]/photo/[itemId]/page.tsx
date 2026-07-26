import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import PhotoCaptureFlow from "./PhotoCaptureFlow";

export default async function CasePhotoCapturePage({
  params,
}: {
  params: Promise<{ caseId: string; itemId: string }>;
}) {
  const { caseId, itemId } = await params;
  const supabase = supabaseServer();

  const [{ data: caseRow }, { data: zones }] = await Promise.all([
    supabase.from("cases").select("id, body_part_zones(zone_key)").eq("id", caseId).single(),
    supabase
      .from("body_part_zones")
      .select("id, zone_key, view, display_name, dose_category")
      .eq("active", true)
      .order("sort_order"),
  ]);

  if (!caseRow) return notFound();
  const currentZone = Array.isArray(caseRow.body_part_zones) ? caseRow.body_part_zones[0] : caseRow.body_part_zones;

  return (
    <PhotoCaptureFlow
      caseId={caseId}
      itemId={itemId}
      zones={zones ?? []}
      currentZoneKey={currentZone?.zone_key ?? null}
    />
  );
}
