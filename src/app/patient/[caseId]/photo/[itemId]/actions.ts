"use server";

import { supabaseServer } from "@/lib/supabase";

export async function uploadPhotoAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const itemId = formData.get("item_id") as string;
  const bodySite = (formData.get("body_site") as string) || null;
  const maskType = (formData.get("mask_type") as string) || "generic";
  const file = formData.get("file") as File;

  if (!file || file.size === 0) {
    return { ok: false, message: "沒有收到照片" };
  }

  const supabase = supabaseServer();
  const path = `${caseId}/${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from("wound-photos")
    .upload(path, file, { contentType: "image/jpeg" });
  if (uploadError) {
    return { ok: false, message: `上傳失敗：${uploadError.message}` };
  }

  await supabase.from("photos").insert({
    case_id: caseId,
    schedule_item_id: itemId,
    file_path: path,
    body_site: bodySite,
    mask_type: maskType,
    uploaded_by: "patient_sim",
    uploaded_via: "line_sim",
  });

  return { ok: true, message: "照片已上傳" };
}
