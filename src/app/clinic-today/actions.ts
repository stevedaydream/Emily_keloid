"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";
import { addTreatmentRecordAction } from "@/app/cases/[id]/actions";

export type ClinicCaseData = Awaited<ReturnType<typeof getClinicCaseAction>>;

/** 一張門診卡片需要的資料。手動加入的個案也走這支（自動名單則由頁面一次撈好）。 */
export async function getClinicCaseAction(caseId: string) {
  const supabase = supabaseServer();

  const [{ data: caseRow }, { data: lesions }, { data: treatmentTypes }, { data: scheduleItems }] = await Promise.all([
    supabase
      .from("cases")
      .select("id, research_id, sex, age_at_enrollment, phone_number, jsw_score, body_site, doctors(code, name)")
      .eq("id", caseId)
      .single(),
    supabase
      .from("case_keloid_lesions")
      .select("id, site_no, body_site, body_part_zone_id, body_part_zones(display_name, dose_category)")
      .eq("case_id", caseId)
      .order("site_no"),
    supabase.from("treatment_types").select("id, name").eq("active", true).order("sort_order"),
    supabase
      .from("case_schedule_items")
      .select("id, label, due_date, status, actions, questionnaire_id")
      .eq("case_id", caseId)
      .eq("status", "pending")
      .order("due_date"),
  ]);

  const doctor = caseRow ? (Array.isArray(caseRow.doctors) ? caseRow.doctors[0] : caseRow.doctors) : null;

  return {
    id: caseRow?.id ?? caseId,
    research_id: caseRow?.research_id ?? "",
    doctor: doctor ? `${doctor.code} ${doctor.name}` : "",
    sex: caseRow?.sex ?? "",
    age_at_enrollment: caseRow?.age_at_enrollment ?? null,
    phone_number: caseRow?.phone_number ?? "",
    jsw_score: caseRow?.jsw_score ?? "",
    body_site: caseRow?.body_site ?? "",
    lesions: (lesions ?? []).map((l) => {
      const zone = Array.isArray(l.body_part_zones) ? l.body_part_zones[0] : l.body_part_zones;
      return {
        id: l.id,
        site_no: l.site_no,
        body_site: l.body_site,
        doseCategory: zone?.dose_category ?? null,
      };
    }),
    treatmentTypes: treatmentTypes ?? [],
    scheduleItems: scheduleItems ?? [],
  };
}

/**
 * 一張卡片一次送出：基本資料 ＋ 當次治療紀錄 ＋ 標記完成的時程項目。
 * 門診是「對著人做事」，處理完這位病人就送出，跟批次編輯頁的累積式儲存刻意不同。
 */
export async function saveClinicCardAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const caseId = formData.get("case_id") as string;
  if (!caseId) return { ok: false, message: "缺少個案" };

  const operator = (await getCurrentOperator()) ?? "未知操作者";
  const supabase = supabaseServer();
  const done: string[] = [];

  // ① 基本資料（只寫表單真的有送出的欄位，避免把沒顯示的欄位清成 null）
  const basic: Record<string, string | number | null> = {};
  if (formData.has("sex")) basic.sex = ((formData.get("sex") as string) || "").trim() || null;
  if (formData.has("age_at_enrollment")) {
    const raw = ((formData.get("age_at_enrollment") as string) || "").trim();
    basic.age_at_enrollment = raw ? Number(raw) : null;
  }
  if (formData.has("phone_number")) basic.phone_number = ((formData.get("phone_number") as string) || "").trim() || null;
  if (formData.has("jsw_score")) basic.jsw_score = ((formData.get("jsw_score") as string) || "").trim() || null;

  if (Object.keys(basic).length > 0) {
    const { error } = await supabase.from("cases").update(basic).eq("id", caseId);
    if (error) return { ok: false, message: `基本資料儲存失敗：${error.message}` };
    done.push("基本資料");
  }

  // ② 治療／追蹤紀錄：有勾治療方式才建立。直接沿用個案頁那支 action，
  //    這樣「手術切除 → 依各部位劑量分類自動排放療」的邏輯只有一份實作。
  const typeIds = formData.getAll("type_ids") as string[];
  if (typeIds.length > 0) {
    const treatmentForm = new FormData();
    treatmentForm.set("case_id", caseId);
    for (const id of typeIds) treatmentForm.append("type_ids", id);
    treatmentForm.set("treatment_date", (formData.get("treatment_date") as string) ?? "");
    for (const lid of formData.getAll("lesion_ids") as string[]) treatmentForm.append("lesion_ids", lid);
    if (formData.get("body_site")) treatmentForm.set("body_site", formData.get("body_site") as string);
    if (formData.get("recurrence_observed")) treatmentForm.set("recurrence_observed", "on");
    if (formData.get("recurrence_description")) treatmentForm.set("recurrence_description", formData.get("recurrence_description") as string);
    if (formData.get("blood_drawn")) treatmentForm.set("blood_drawn", "on");
    if (formData.get("blood_drawn_note")) treatmentForm.set("blood_drawn_note", formData.get("blood_drawn_note") as string);

    try {
      await addTreatmentRecordAction(treatmentForm);
      done.push("治療紀錄");
    } catch (e) {
      return { ok: false, message: `治療紀錄儲存失敗：${e instanceof Error ? e.message : "未知錯誤"}` };
    }
  }

  // ③ 標記完成的時程項目
  const doneItemIds = formData.getAll("done_item_ids") as string[];
  if (doneItemIds.length > 0) {
    const { error } = await supabase
      .from("case_schedule_items")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .in("id", doneItemIds);
    if (error) return { ok: false, message: `時程標記失敗：${error.message}` };
    done.push(`${doneItemIds.length} 個時程項目`);
  }

  if (done.length === 0) return { ok: false, message: "沒有任何變更" };

  await logAudit({
    caseId,
    operatorName: operator,
    action: "clinic_today_save",
    entity: "cases",
    entityId: caseId,
    detail: { saved: done },
  });

  revalidatePath("/clinic-today");
  return { ok: true, message: `已儲存：${done.join("、")}` };
}
