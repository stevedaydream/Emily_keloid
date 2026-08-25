import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import VisitFlow from "./VisitFlow";
import { monthsSinceSurgery, scaleNamesForVisit, timepointForVisit, type VisitLesion } from "@/lib/visitFlow";
import type { ClinicianScale } from "@/lib/clinicFlow";

const taipeiDate = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(d);

// 回診動線（決策 2026-08-20）。跟收案動線 /cases/[id]/clinic-flow 同一個長相，
// 差別是「完成」一律限定在本次回診當天——病灶三個月前拍過照不代表這次拍了。
export default async function VisitFlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseServer();
  const today = taipeiDate(new Date());

  const [{ data: caseRow }, { data: zones }, { data: lesionRows }, { data: treatments }, { data: symptomOptions }, { data: types }] =
    await Promise.all([
      supabase.from("cases").select("id, research_id, sex").eq("id", id).single(),
      supabase
        .from("body_part_zones")
        .select("id, zone_key, view, display_name, dose_category")
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("case_keloid_lesions")
        .select("id, site_no, body_site, is_primary, length_cm, width_cm, height_cm, measured_at")
        .eq("case_id", id)
        .order("site_no"),
      supabase
        .from("treatment_records")
        .select("id, treatment_date, treatment_types(name)")
        .eq("case_id", id)
        .order("treatment_date"),
      supabase
        .from("case_intake_option_lists")
        .select("id, label")
        .eq("category", "symptom_change")
        .eq("active", true)
        .order("sort_order"),
      supabase.from("treatment_types").select("id, name").eq("active", true).order("sort_order"),
    ]);

  if (!caseRow) return notFound();

  // 手術日＝最早一筆「手術切除」。所有術後時間點（第幾個月、抽血窗期、放療）都以它為錨。
  const typeNameOf = (t: { treatment_types: unknown }) => {
    const tt = Array.isArray(t.treatment_types) ? t.treatment_types[0] : t.treatment_types;
    return (tt as { name?: string } | null)?.name ?? "";
  };
  const surgeryDate = (treatments ?? []).find((t) => typeNameOf(t) === "手術切除")?.treatment_date ?? null;
  const monthIndex = monthsSinceSurgery(surgeryDate, today);
  // 本次回診落在哪個追蹤時間點的窗期（術後滿 1 / 6 / 12 個月 ±10 天，助理 2026-08-24）。
  // null ＝ 一般回診，不用重測量表。
  const timepoint = timepointForVisit(surgeryDate, today);

  // 本次回診已登記＝今天有任何一筆治療紀錄（含「追蹤（無治療）」）。
  const visitRegistered = (treatments ?? []).some((t) => t.treatment_date === today);

  // 今天拍的照片才算數
  const { data: photosToday } = await supabase
    .from("photos")
    .select("lesion_id, taken_at")
    .eq("case_id", id)
    .gte("taken_at", `${today}T00:00:00+08:00`)
    .lte("taken_at", `${today}T23:59:59+08:00`);
  const photoToday = new Map<string, number>();
  for (const p of photosToday ?? []) {
    if (p.lesion_id) photoToday.set(p.lesion_id, (photoToday.get(p.lesion_id) ?? 0) + 1);
  }

  const lesions: VisitLesion[] = (lesionRows ?? []).map((l) => ({
    id: l.id,
    site_no: l.site_no,
    body_site: l.body_site,
    is_primary: l.is_primary ?? false,
    measured_at: l.measured_at,
    hasSize: l.length_cm !== null && l.width_cm !== null && l.height_cm !== null,
    length_cm: l.length_cm,
    width_cm: l.width_cm,
    height_cm: l.height_cm,
    photoCountToday: photoToday.get(l.id) ?? 0,
  }));

  // 本次要重測的量表：只有落在時間點窗期時才測，三份一起（JSS ＋ SF-36 ＋ PSQI）。
  const wantedNames = scaleNamesForVisit(timepoint);
  const { data: templates } = await supabase.from("questionnaire_templates").select("id, name").in("name", wantedNames);
  const templateIds = (templates ?? []).map((t) => t.id);
  const { data: scaleResponses } = templateIds.length
    ? await supabase
        .from("questionnaire_responses")
        .select("questionnaire_id, submitted_at")
        .eq("case_id", id)
        .in("questionnaire_id", templateIds)
    : { data: [] };
  const doneToday = new Set(
    (scaleResponses ?? []).filter((r) => taipeiDate(new Date(r.submitted_at)) === today).map((r) => r.questionnaire_id)
  );
  const scales: ClinicianScale[] = wantedNames
    .map((name) => {
      const t = (templates ?? []).find((x) => x.name === name);
      return t ? { id: t.id, name: t.name, done: doneToday.has(t.id) } : null;
    })
    .filter((s): s is ClinicianScale => s !== null);

  // 今天到期或已逾期的待辦時程（含抽血窗期），收尾那一步要標記完成／改期
  const { data: dueItems } = await supabase
    .from("case_schedule_items")
    .select("id, label, due_date, actions")
    .eq("case_id", id)
    .eq("status", "pending")
    .lte("due_date", today)
    .order("due_date");

  return (
    <VisitFlow
      caseId={id}
      researchId={caseRow.research_id}
      today={today}
      surgeryDate={surgeryDate}
      monthIndex={monthIndex}
      timepoint={timepoint}
      visitRegistered={visitRegistered}
      lesions={lesions}
      zones={zones ?? []}
      sex={caseRow.sex ?? null}
      scales={scales}
      missingScaleNames={wantedNames.filter((n) => !scales.some((s) => s.name === n))}
      symptomOptions={symptomOptions ?? []}
      treatmentTypes={types ?? []}
      dueItems={dueItems ?? []}
    />
  );
}
