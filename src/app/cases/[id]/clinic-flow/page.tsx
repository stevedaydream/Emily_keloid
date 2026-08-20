import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import ClinicFlow from "./ClinicFlow";
import { CLINICIAN_SCALE_NAMES, type ClinicianScale, type LesionCheck } from "@/lib/clinicFlow";

// 診間收案動線（決策 2026-08-20）。病人把平板還回來之後走的那一段：
// 量測長寬高＋拍照 → 醫師評分（JSS ＋ VSS）。放在 /cases/[id] 底下而不是 /patient 底下，
// 是因為這一段從頭到尾都是人員操作，不該套用病人版那個「不渲染導覽列」的全螢幕版型。
export default async function ClinicFlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseServer();

  const [{ data: caseRow }, { data: progress }, { data: zones }, { data: lesionRows }, { data: photos }, { data: scaleTemplates }] =
    await Promise.all([
      supabase.from("cases").select("id, research_id, sex").eq("id", id).single(),
      supabase.from("case_patient_intake_progress").select("segment_key").eq("case_id", id),
      supabase
        .from("body_part_zones")
        .select("id, zone_key, view, display_name, dose_category")
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("case_keloid_lesions")
        .select("id, site_no, body_site, length_cm, width_cm, height_cm, measure_waived, photo_waived")
        .eq("case_id", id)
        .order("site_no"),
      supabase.from("photos").select("lesion_id").eq("case_id", id),
      supabase
        .from("questionnaire_templates")
        .select("id, name")
        .in("name", CLINICIAN_SCALE_NAMES as unknown as string[]),
    ]);

  if (!caseRow) return notFound();

  const photoCount = new Map<string, number>();
  for (const p of photos ?? []) {
    if (p.lesion_id) photoCount.set(p.lesion_id, (photoCount.get(p.lesion_id) ?? 0) + 1);
  }

  const lesions: LesionCheck[] = (lesionRows ?? []).map((l) => ({
    id: l.id,
    site_no: l.site_no,
    body_site: l.body_site,
    length_cm: l.length_cm,
    width_cm: l.width_cm,
    height_cm: l.height_cm,
    measure_waived: l.measure_waived ?? false,
    photo_waived: l.photo_waived ?? false,
    photoCount: photoCount.get(l.id) ?? 0,
  }));

  // 「這次門診有沒有填過」＝最近一筆是不是今天。兩份量表每次追蹤都會重填，
  // 所以不能只看有沒有紀錄；但本次收案的判定用日期就夠，不需要另外記一個狀態欄位。
  const taipeiDate = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(d);
  const today = taipeiDate(new Date());
  const templateIds = (scaleTemplates ?? []).map((t) => t.id);
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

  // 依 CLINICIAN_SCALE_NAMES 的順序排（先診斷分類、再嚴重度），不是資料庫回傳的順序。
  const scales: ClinicianScale[] = CLINICIAN_SCALE_NAMES.map((name) => {
    const t = (scaleTemplates ?? []).find((x) => x.name === name);
    return t ? { id: t.id, name: t.name, done: doneToday.has(t.id) } : null;
  }).filter((s): s is ClinicianScale => s !== null);

  return (
    <ClinicFlow
      caseId={id}
      researchId={caseRow.research_id}
      intakeDone={(progress ?? []).length}
      lesions={lesions}
      zones={zones ?? []}
      sex={caseRow.sex ?? null}
      scales={scales}
      missingScaleNames={CLINICIAN_SCALE_NAMES.filter((n) => !scales.some((s) => s.name === n))}
    />
  );
}
