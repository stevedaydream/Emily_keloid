import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import PhotoCaptureFlow from "./PhotoCaptureFlow";

export default async function CasePhotoCapturePage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string; itemId?: string[] }>;
  searchParams: Promise<{ lesion_id?: string; zone_key?: string; next?: string }>;
}) {
  const { caseId, itemId: itemIdParam } = await params;
  const { lesion_id: lesionIdParam, zone_key: zoneKeyParam, next: nextParam } = await searchParams;
  const itemId = itemIdParam?.[0] ?? "";
  const supabase = supabaseServer();

  const [{ data: caseRow }, { data: zones }, { data: lesions }, { data: casePhotos }] = await Promise.all([
    supabase.from("cases").select("id, sex").eq("id", caseId).single(),
    supabase
      .from("body_part_zones")
      .select("id, zone_key, view, display_name, dose_category")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("case_keloid_lesions")
      .select("id, site_no, body_site, note, length_cm, width_cm, height_cm, body_part_zones(zone_key, dose_category)")
      .eq("case_id", caseId)
      .order("site_no"),
    supabase.from("photos").select("lesion_id").eq("case_id", caseId),
  ]);

  if (!caseRow) return notFound();

  // 每個部位已拍照張數，供拍照頁標示「尚未拍照 / 已拍 N 張」。
  const photoCountByLesion = new Map<string, number>();
  for (const p of casePhotos ?? []) {
    if (p.lesion_id) photoCountByLesion.set(p.lesion_id, (photoCountByLesion.get(p.lesion_id) ?? 0) + 1);
  }
  // 部位自己的 body_part_zone 決定對齊蒙板樣式（2026-07-27 多部位整合前這裡固定用通用蒙板）
  const sites = (lesions ?? []).map((l) => {
    const zone = Array.isArray(l.body_part_zones) ? l.body_part_zones[0] : l.body_part_zones;
    return {
      id: l.id,
      site_no: l.site_no,
      body_site: l.body_site,
      note: l.note,
      zoneKey: zone?.zone_key ?? "",
      doseCategory: zone?.dose_category ?? "other",
      photoCount: photoCountByLesion.get(l.id) ?? 0,
      length: l.length_cm != null ? String(l.length_cm) : "",
      width: l.width_cm != null ? String(l.width_cm) : "",
      height: l.height_cm != null ? String(l.height_cm) : "",
    };
  });

  return (
    <PhotoCaptureFlow
      caseId={caseId}
      itemId={itemId}
      zones={zones ?? []}
      sex={caseRow.sex ?? null}
      sites={sites}
      initialLesionId={lesionIdParam ?? null}
      initialZoneKey={zoneKeyParam ?? null}
      next={nextParam ?? null}
    />
  );
}
