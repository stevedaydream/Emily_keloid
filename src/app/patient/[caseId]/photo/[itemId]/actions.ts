"use server";

import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";

export async function uploadPhotoAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const itemId = formData.get("item_id") as string;
  const zoneKey = formData.get("zone_key") as string;
  const file = formData.get("file") as File;

  if (!file || file.size === 0) {
    return { ok: false, message: "沒有收到照片" };
  }

  const supabase = supabaseServer();
  const operator = (await getCurrentOperator()) ?? "未知操作者";

  const { data: zone } = await supabase
    .from("body_part_zones")
    .select("id, display_name")
    .eq("zone_key", zoneKey)
    .single();

  const path = `${caseId}/${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("wound-photos")
    .upload(path, file, { contentType: "image/jpeg" });
  if (uploadError) {
    return { ok: false, message: `上傳失敗：${uploadError.message}` };
  }

  await supabase.from("photos").insert({
    case_id: caseId,
    schedule_item_id: itemId || null,
    file_path: path,
    body_site: zone?.display_name ?? null,
    body_part_zone_id: zone?.id ?? null,
    mask_type: "generic",
    uploaded_by: operator,
    uploaded_via: "staff",
  });

  // 個案尚未設定主要部位時，第一次拍照選的部位順便設為主要部位（供放療劑量分類判斷）
  const { data: caseRow } = await supabase.from("cases").select("body_part_zone_id").eq("id", caseId).single();
  if (caseRow && !caseRow.body_part_zone_id && zone) {
    await supabase.from("cases").update({ body_part_zone_id: zone.id, body_site: zone.display_name }).eq("id", caseId);
  }

  await logAudit({ caseId, operatorName: operator, action: "upload_photo", entity: "photos", detail: { zoneKey } });

  return { ok: true, message: "照片已上傳" };
}
