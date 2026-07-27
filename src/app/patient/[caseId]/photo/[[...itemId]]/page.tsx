import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import PhotoCaptureFlow from "./PhotoCaptureFlow";

export default async function CasePhotoCapturePage({
  params,
}: {
  params: Promise<{ caseId: string; itemId?: string[] }>;
}) {
  const { caseId, itemId: itemIdParam } = await params;
  const itemId = itemIdParam?.[0] ?? "";
  const supabase = supabaseServer();

  const [{ data: caseRow }, { data: zones }, { data: lesions }, { data: casePhotos }] = await Promise.all([
    supabase.from("cases").select("id, sex, body_part_zones(zone_key)").eq("id", caseId).single(),
    supabase
      .from("body_part_zones")
      .select("id, zone_key, view, display_name, dose_category")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("case_keloid_lesions")
      .select("id, site_no, body_site, note")
      .eq("case_id", caseId)
      .order("site_no"),
    supabase.from("photos").select("lesion_id").eq("case_id", caseId),
  ]);

  if (!caseRow) return notFound();
  const currentZone = Array.isArray(caseRow.body_part_zones) ? caseRow.body_part_zones[0] : caseRow.body_part_zones;

  // 每個部位已拍照張數，供拍照頁標示「尚未拍照 / 已拍 N 張」。
  const photoCountByLesion = new Map<string, number>();
  for (const p of casePhotos ?? []) {
    if (p.lesion_id) photoCountByLesion.set(p.lesion_id, (photoCountByLesion.get(p.lesion_id) ?? 0) + 1);
  }
  const sites = (lesions ?? []).map((l) => ({
    id: l.id,
    site_no: l.site_no,
    body_site: l.body_site,
    note: l.note,
    photoCount: photoCountByLesion.get(l.id) ?? 0,
  }));

  return (
    <PhotoCaptureFlow
      caseId={caseId}
      itemId={itemId}
      zones={zones ?? []}
      currentZoneKey={currentZone?.zone_key ?? null}
      sex={caseRow.sex ?? null}
      sites={sites}
    />
  );
}
