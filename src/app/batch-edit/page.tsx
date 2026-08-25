import { supabaseServer } from "@/lib/supabase";
import BatchEditTable, { type BatchCaseRow } from "./BatchEditTable";

// 批次編輯：一次載入全部個案（目前 92 筆，規模還小），不做分頁——
// 分頁會讓「累積後一次送出」的未儲存變更在翻頁時陷入兩難（跟著跑或掉了都不對）。
export default async function BatchEditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const supabase = supabaseServer();

  let query = supabase
    .from("cases")
    .select(
      "id, research_id, patient_name, sex, age_at_enrollment, phone_number, consent_signed_at, jsw_score, body_site, recurrence_status, recurrence_date, followup_cutoff_date, notes, data_source, enrollment_year, doctors(code, name)"
    )
    .order("research_id");

  if (sp.year) query = query.eq("enrollment_year", Number(sp.year));
  if (sp.source) query = query.eq("data_source", sp.source);
  if (sp.consent === "signed") query = query.not("consent_signed_at", "is", null);
  if (sp.consent === "unsigned") query = query.is("consent_signed_at", null);
  if (sp.recurrence) query = query.eq("recurrence_status", sp.recurrence);

  const [{ data: cases }, { data: completeness }, { data: lesionRows }, { data: photoRows }, { data: treatmentRows }, { data: scheduleRows }] =
    await Promise.all([
      query,
      supabase.from("case_data_completeness").select("case_id, status").eq("status", "pending"),
      supabase.from("case_keloid_lesions").select("case_id, body_part_zone_id"),
      supabase.from("photos").select("case_id"),
      supabase.from("treatment_records").select("case_id"),
      supabase.from("case_schedule_items").select("case_id, status").eq("status", "pending"),
    ]);

  const countBy = (rows: { case_id: string }[] | null) => {
    const map = new Map<string, number>();
    for (const r of rows ?? []) map.set(r.case_id, (map.get(r.case_id) ?? 0) + 1);
    return map;
  };
  const pendingCompleteness = countBy(completeness as { case_id: string }[] | null);
  const photoCount = countBy(photoRows as { case_id: string }[] | null);
  const treatmentCount = countBy(treatmentRows as { case_id: string }[] | null);
  const pendingSchedule = countBy(scheduleRows as { case_id: string }[] | null);

  const lesionCount = new Map<string, number>();
  const lesionUnclassified = new Map<string, number>();
  for (const l of (lesionRows ?? []) as { case_id: string; body_part_zone_id: string | null }[]) {
    lesionCount.set(l.case_id, (lesionCount.get(l.case_id) ?? 0) + 1);
    if (!l.body_part_zone_id) lesionUnclassified.set(l.case_id, (lesionUnclassified.get(l.case_id) ?? 0) + 1);
  }

  const rows: BatchCaseRow[] = (cases ?? []).map((c) => {
    const doctor = Array.isArray(c.doctors) ? c.doctors[0] : c.doctors;
    return {
      id: c.id,
      research_id: c.research_id,
      patient_name: c.patient_name ?? null,
      doctor: doctor ? `${doctor.code}` : "",
      sex: c.sex ?? "",
      age_at_enrollment: c.age_at_enrollment === null || c.age_at_enrollment === undefined ? "" : String(c.age_at_enrollment),
      phone_number: c.phone_number ?? "",
      consent_signed_at: c.consent_signed_at ?? "",
      jsw_score: c.jsw_score ?? "",
      recurrence_status: c.recurrence_status ?? "",
      recurrence_date: c.recurrence_date ?? "",
      followup_cutoff_date: c.followup_cutoff_date ?? "",
      notes: c.notes ?? "",
      body_site: c.body_site ?? "",
      lesionCount: lesionCount.get(c.id) ?? 0,
      lesionUnclassified: lesionUnclassified.get(c.id) ?? 0,
      treatmentCount: treatmentCount.get(c.id) ?? 0,
      photoCount: photoCount.get(c.id) ?? 0,
      pendingScheduleCount: pendingSchedule.get(c.id) ?? 0,
      pendingCompletenessCount: pendingCompleteness.get(c.id) ?? 0,
    };
  });

  const years = [...new Set((cases ?? []).map((c) => c.enrollment_year))].sort((a, b) => b - a);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-xl font-medium text-brand-900">批次編輯</h1>
        <p className="mt-1 text-sm text-ink/50">
          直接在表格裡修改常補的欄位，改過的格子會標示為待儲存，最後按一次「儲存全部變更」才寫入資料庫。
          病灶、家族史、之前治療史這類需要專用輸入介面的資料，點該列的「詳細」從右側面板編輯，不用離開這一頁。
        </p>
      </div>

      <BatchEditTable rows={rows} years={years} />
    </div>
  );
}
