"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";

export async function uploadPhotoAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const itemId = formData.get("item_id") as string;
  const zoneKey = (formData.get("zone_key") as string) || "";
  const lesionId = (formData.get("lesion_id") as string) || "";
  const file = formData.get("file") as File;
  const thumb = formData.get("thumb") as File | null;

  if (!file || file.size === 0) {
    return { ok: false, message: "沒有收到照片" };
  }

  const supabase = supabaseServer();
  const operator = (await getCurrentOperator()) ?? "未知操作者";

  // 部位來源二選一：①從個案已設定的部位清單（case_keloid_lesions）挑選，或②從身體圖挑一個 body_part_zone。
  const { data: zone } = zoneKey
    ? await supabase.from("body_part_zones").select("id, display_name").eq("zone_key", zoneKey).maybeSingle()
    : { data: null };
  let { data: lesion } = lesionId
    ? await supabase.from("case_keloid_lesions").select("id, body_site, site_no").eq("id", lesionId).maybeSingle()
    : { data: null };

  // 從身體圖直接挑部位拍照（沒帶 lesion_id）時，過去照片只會存 body_part_zone_id，
  // 不會掛到任何一個「部位N」，個案頁面因此把它歸到「未對應部位」——看起來就是拍照跟點選的部位沒有連結。
  // 改為：同一個 zone 已有病灶就掛上去，沒有就當場建一個部位，讓每張照片都必定對應到一個部位。
  if (!lesion && zone) {
    const { data: sameZoneLesion } = await supabase
      .from("case_keloid_lesions")
      .select("id, body_site, site_no")
      .eq("case_id", caseId)
      .eq("body_part_zone_id", zone.id)
      .order("site_no", { nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (sameZoneLesion) {
      lesion = sameZoneLesion;
    } else {
      const { data: lastSite } = await supabase
        .from("case_keloid_lesions")
        .select("site_no")
        .eq("case_id", caseId)
        .order("site_no", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: created } = await supabase
        .from("case_keloid_lesions")
        .insert({
          case_id: caseId,
          site_no: (lastSite?.site_no ?? 0) + 1,
          body_site: zone.display_name,
          body_part_zone_id: zone.id,
          note: "拍照時自動建立",
        })
        .select("id, body_site, site_no")
        .single();
      lesion = created ?? null;

      // cases.body_site 是病灶清單的去正規化摘要（列表/搜尋/dashboard 都讀這欄），新增部位後同步一次
      if (created) {
        const { data: allLesions } = await supabase
          .from("case_keloid_lesions")
          .select("body_site")
          .eq("case_id", caseId)
          .order("site_no");
        if (allLesions && allLesions.length > 0) {
          await supabase
            .from("cases")
            .update({ body_site: allLesions.map((l) => l.body_site).join("、") })
            .eq("id", caseId);
        }
      }
    }
  }

  const bodySite = lesion ? `部位${lesion.site_no ?? ""} ${lesion.body_site}`.trim() : zone?.display_name ?? null;

  const timestamp = Date.now();
  const path = `${caseId}/${timestamp}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("wound-photos")
    .upload(path, file, { contentType: "image/jpeg" });
  if (uploadError) {
    return { ok: false, message: `上傳失敗：${uploadError.message}` };
  }

  let thumbnailPath: string | null = null;
  if (thumb && thumb.size > 0) {
    const candidatePath = `thumbs/${caseId}/${timestamp}.jpg`;
    const { error: thumbError } = await supabase.storage
      .from("wound-photos")
      .upload(candidatePath, thumb, { contentType: "image/jpeg" });
    // 縮圖上傳失敗不影響原圖已上傳成功的結果，前端會 fallback 顯示原圖。
    if (!thumbError) thumbnailPath = candidatePath;
  }

  await supabase.from("photos").insert({
    case_id: caseId,
    schedule_item_id: itemId || null,
    lesion_id: lesion?.id ?? null,
    file_path: path,
    thumbnail_path: thumbnailPath,
    body_site: bodySite,
    body_part_zone_id: zone?.id ?? null,
    mask_type: "generic",
    uploaded_by: operator,
    uploaded_via: "staff",
  });

  // 2026-07-27 多部位整合後不再有個案層級的「主要部位」：部位分類一律來自 case_keloid_lesions，
  // 拍照只記錄這張照片拍的是哪個部位，不再回寫 cases.body_part_zone_id。
  await logAudit({
    caseId,
    operatorName: operator,
    action: "upload_photo",
    entity: "photos",
    detail: { zoneKey, lesionId: lesion?.id ?? null },
  });

  // 個案頁面的部位縮圖／張數要立刻反映這張新照片
  revalidatePath(`/cases/${caseId}`);
  revalidatePath(`/patient/${caseId}/photo`);

  return { ok: true, message: lesion ? `照片已上傳（部位${lesion.site_no ?? ""} ${lesion.body_site}）` : "照片已上傳" };
}
