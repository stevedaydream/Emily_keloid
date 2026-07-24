import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import CameraCapture from "./CameraCapture";

export default async function PatientPhotoPage({
  params,
}: {
  params: Promise<{ caseId: string; itemId: string }>;
}) {
  const { caseId, itemId } = await params;
  const supabase = supabaseServer();

  const { data: caseRow } = await supabase.from("cases").select("id, body_site").eq("id", caseId).single();
  if (!caseRow) return notFound();

  const { data: mask } = await supabase
    .from("body_site_masks")
    .select("mask_type, mask_config")
    .eq("site_name", caseRow.body_site ?? "")
    .maybeSingle();

  const maskConfig = mask?.mask_config as { shape?: string } | undefined;

  return (
    <CameraCapture
      caseId={caseId}
      itemId={itemId}
      bodySite={caseRow.body_site}
      maskType={mask?.mask_type ?? "generic"}
      maskShape={maskConfig?.shape ?? "crosshair_ruler"}
    />
  );
}
