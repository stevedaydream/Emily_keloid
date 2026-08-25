"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { measureBlockers } from "@/lib/clinicFlow";
import { monthsSinceSurgery, timepointForVisit, visitLesionTodos } from "@/lib/visitFlow";
import { logAudit } from "@/lib/audit";
import { addTreatmentRecordAction } from "@/app/cases/[id]/actions";

export type ClinicCaseData = Awaited<ReturnType<typeof getClinicCaseAction>>;

/** 一張門診卡片需要的資料。手動加入的個案也走這支（自動名單則由頁面一次撈好）。 */
export async function getClinicCaseAction(caseId: string) {
  const supabase = supabaseServer();

  const [{ data: caseRow }, { data: lesions }, { data: treatmentTypes }, { data: scheduleItems }, { data: photos }, { data: allTreatments }] =
    await Promise.all([
    supabase
      .from("cases")
      .select("id, research_id, sex, age_at_enrollment, phone_number, jsw_score, body_site, doctors(code, name)")
      .eq("id", caseId)
      .single(),
    supabase
      .from("case_keloid_lesions")
      .select(
        "id, site_no, body_site, is_primary, body_part_zone_id, length_cm, width_cm, height_cm, measured_at, measure_waived, photo_waived, body_part_zones(display_name, dose_category)"
      )
      .eq("case_id", caseId)
      .order("site_no"),
    supabase.from("treatment_types").select("id, name").eq("active", true).order("sort_order"),
    supabase
      .from("case_schedule_items")
      .select("id, label, due_date, status, actions, questionnaire_id")
      .eq("case_id", caseId)
      .eq("status", "pending")
      .order("due_date"),
    // 病灶照片張數：卡片要提醒「這位還沒量／還沒拍，別讓他走」（決策 2026-08-20）
    supabase.from("photos").select("lesion_id, taken_at").eq("case_id", caseId),
    // 回診進度：今天有沒有登記回診（＝今天有沒有任何一筆治療紀錄，含「追蹤（無治療）」）
    supabase.from("treatment_records").select("treatment_date, treatment_types(name)").eq("case_id", caseId),
  ]);

  const doctor = caseRow ? (Array.isArray(caseRow.doctors) ? caseRow.doctors[0] : caseRow.doctors) : null;

  const photoCount = new Map<string, number>();
  for (const p of photos ?? []) {
    if (p.lesion_id) photoCount.set(p.lesion_id, (photoCount.get(p.lesion_id) ?? 0) + 1);
  }
  // 判定用 lib/clinicFlow 那一套，不在這裡另外寫一遍——三個地方各寫一次「什麼叫量完了」遲早會不一致。
  const measureBlocked = measureBlockers(
    (lesions ?? []).map((l) => ({
      id: l.id,
      site_no: l.site_no,
      body_site: l.body_site,
      is_primary: l.is_primary ?? false,
      length_cm: l.length_cm,
      width_cm: l.width_cm,
      height_cm: l.height_cm,
      measure_waived: l.measure_waived ?? false,
      photo_waived: l.photo_waived ?? false,
      photoCount: photoCount.get(l.id) ?? 0,
    }))
  );

  // ── 回診進度（決策 2026-08-20）──────────────────────────────
  // 收案動線看的是「有沒有做過」，回診看的是「今天做了沒」——三個月前拍過照
  // 對這次回診沒有意義。所以這裡的判定一律限定當天。
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date());
  const typeNameOf = (t: { treatment_types: unknown }) => {
    const tt = Array.isArray(t.treatment_types) ? t.treatment_types[0] : t.treatment_types;
    return (tt as { name?: string } | null)?.name ?? "";
  };
  const surgeryDate = (allTreatments ?? []).find((t) => typeNameOf(t) === "手術切除")?.treatment_date ?? null;
  const visitRegistered = (allTreatments ?? []).some((t) => t.treatment_date === today);
  const photoTodayCount = new Map<string, number>();
  for (const p of photos ?? []) {
    if (p.lesion_id && String(p.taken_at).slice(0, 10) === today) {
      photoTodayCount.set(p.lesion_id, (photoTodayCount.get(p.lesion_id) ?? 0) + 1);
    }
  }
  const visitTodos = visitLesionTodos(
    (lesions ?? []).map((l) => ({
      id: l.id,
      site_no: l.site_no,
      body_site: l.body_site,
      is_primary: l.is_primary ?? false,
      measured_at: l.measured_at,
      hasSize: l.length_cm !== null && l.width_cm !== null && l.height_cm !== null,
      length_cm: l.length_cm,
      width_cm: l.width_cm,
      height_cm: l.height_cm,
      photoCountToday: photoTodayCount.get(l.id) ?? 0,
    })),
    today,
    // 已登記手術就不再要求重新量測——尺寸只收術前 baseline（助理 2026-08-24）
    surgeryDate !== null && today >= surgeryDate
  );

  return {
    measureBlockers: measureBlocked,
    /** 已登記手術＝進入追蹤期，卡片才顯示回診動線那一段 */
    inFollowup: surgeryDate !== null,
    visitRegistered,
    visitTodos,
    monthIndex: monthsSinceSurgery(surgeryDate, today),
    /** 已登記手術＝術後不再要求量測，卡片的文字要跟著改 */
    postOp: surgeryDate !== null && today >= surgeryDate,
    /** 本次回診落在哪個追蹤時間點（術後滿 1／6／12 個月 ±10 天）；null ＝ 本次不用測量表 */
    timepointLabel: timepointForVisit(surgeryDate, today)?.label ?? null,
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
