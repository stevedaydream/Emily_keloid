import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import {
  markScheduleItemAction,
  updateScheduleItemQuestionnaireAction,
  updateCompletenessAction,
  updateConsentAction,
  markRadiotherapySessionAction,
  updateBiobankChecklistAction,
  updateDemographicsAction,
  updateOutcomeAction,
  updateLegacyBiobankAction,
  updatePriorHistoryAction,
  addLabResultsBatchAction,
  deleteLabResultAction,
  updateScheduleItemDateAction,
  addScheduleItemAction,
} from "./actions";
import TreatmentForm from "./TreatmentForm";
import TreatmentRecordList from "./TreatmentRecordList";
// import TermRecordForm from "./TermRecordForm"; // 醫學術語紀錄 2026-08-13 暫時停用
import DiagnosisSection from "./DiagnosisSection";
import PipelineProgress from "./PipelineProgress";
import IntakeOptionForm from "./IntakeOptionForm";
import FamilyHistoryPicker from "./FamilyHistoryPicker";
import PriorTreatmentPicker from "./PriorTreatmentPicker";
import MultiEntryInput from "./MultiEntryInput";
import KeloidLesionSection from "./KeloidLesionSection";
import InfoTooltip from "@/components/InfoTooltip";
import PatientName from "@/components/LocalNameProvider";
import SubmitButton from "@/components/ui/SubmitButton";
import CollapsedList from "@/components/ui/CollapsedList";
import type { CasePipelineRow } from "@/lib/pipeline";
import { DOSE_CATEGORY_LABEL } from "@/lib/bodyZones";
import { PATIENT_INTAKE_SEGMENTS } from "@/lib/patientIntake";
import { resolveFollowupAction } from "@/app/patient/[caseId]/intake/actions";
import { computeSF36, computePSQI, computeJSSClassification } from "@/lib/scoring";
import LineBindingSection from "./LineBindingSection";

// const STAGE_LABEL: Record<string, string> = { pre: "術前", intra: "術中", post: "術後" }; // 同上，隨醫學術語紀錄一起停用
const COMPLETENESS_LABEL: Record<string, string> = {
  has_value: "已有",
  pending: "待補",
  not_applicable: "不適用",
};
const COMPLETENESS_COLOR: Record<string, string> = {
  has_value: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  not_applicable: "bg-ink/10 text-ink/50",
};

// 完整度清單的每個欄位要去哪裡補：對應本頁的區塊 id，點欄位名稱直接捲過去。
const COMPLETENESS_ANCHOR: Record<string, string | undefined> = {
  sex: "section-demographics",
  age: "section-demographics",
  jsw_score: "section-demographics",
  family_history: "section-demographics",
  keloid_history: "section-demographics",
  keloid_size: "section-demographics",
  body_zone_classification: "section-demographics",
  consent_signed_date: "section-consent",
  icd_diagnosis: "section-diagnosis",
  term_records: "section-terms",
  questionnaires: "section-responses",
  lab_markers: "section-lab",
  biobank_checklist: "section-biobank",
  phone: "section-demographics",
};

const BIOBANK_ITEMS = [
  { key: "tissue_paraffin_block", label: "蠟塊", group: "組織" },
  { key: "tissue_keloid_fibroblast_culture", label: "Keloid fibroblast 原代培養", group: "組織" },
  { key: "tissue_periskin_fibroblast_culture", label: "Periskin fibroblast 原代培養", group: "組織" },
  { key: "blood_pre_op", label: "術前", group: "血液" },
  { key: "blood_post_op_day1", label: "術後治療第一天", group: "血液" },
] as const;

// 區塊標題旁的來源標記：這一段是病人自己填的，人員看得出來（也隨時可以覆蓋修改）。
function PatientFilledBadge({ entry }: { entry?: { completed_at: string; filled_via: string } }) {
  if (!entry || entry.filled_via !== "patient") return null;
  return (
    <span className="ml-2 whitespace-nowrap rounded bg-sky-100 px-1.5 py-0.5 text-xs font-normal text-sky-800">
      此段由病人自填 · {new Date(entry.completed_at).toLocaleDateString("zh-TW")}
    </span>
  );
}

const FOLLOWUP_REASON_LABEL: Record<string, string> = {
  unknown: "病人不知道",
  no_detail: "缺細節",
  skipped: "跳過未答",
};

// 飲食衛教／運動禁忌衛教已於 2026-07-27 移除（決策：衛教內容不屬於研究要收的結構化資料，
// 改由後台「衛教資料庫」health_education_kb 維護，只供 LINE 衛教機器人回答時參考）。
const INTAKE_CATEGORIES = [
  // 2026-08-12 docx 項次 2：病人自填流程的「您的蟹足腫是怎麼來的？」已換成這題；
  // 診間人員也能在這裡補記（病人沒填或答得不清楚時）。
  { key: "visit_reason", label: "此次就診主要原因" },
  { key: "onset_cause", label: "發生原因" },
  { key: "referral_source", label: "如何得知看診資訊" },
  // 2026-08-12 新增（docx）：對應部長新版 Excel 的 Keloid_symptom 碼 1-9
  { key: "keloid_symptom", label: "目前不適症狀" },
] as const;

// 與同類其他選項互斥的選項（docx 2026-08-12：「無明顯不適」不可與其他症狀同時勾選）
const EXCLUSIVE_OPTION_BY_CATEGORY: Record<string, string> = {
  keloid_symptom: "無明顯不適",
};

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = supabaseServer();

  const [
    { data: caseRow },
    { data: diagnoses },
    { data: icdCodes },
    // 下面兩項是醫學術語紀錄用的，2026-08-13 該區塊暫時停用。
    // 查詢保留（與陣列位置對齊，拿掉會錯位），只是目前沒有人讀。
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    { data: termLibrary },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    { data: termRecords },
    { data: treatmentTypes },
    { data: presets },
    { data: treatmentRecords },
    { data: scheduleItems },
    { data: responses },
    { data: photos },
    { data: completeness },
    { data: doseProtocols },
    { data: rtDoctors },
    { data: pipeline },
    { data: bodyZones },
    { data: radiotherapySessions },
    { data: biobankItems },
    { data: legacyBiobank },
    { data: intakeOptions },
    { data: intakeRecords },
    { data: labMarkers },
    { data: labResults },
    { data: jssClassificationTemplate },
    { data: keloidLesions },
    { data: questionnaireTemplates },
    { data: patientIntakeProgress },
    { data: intakeFollowups },
  ] = await Promise.all([
    supabase.from("cases").select("*, doctors(code, name)").eq("id", id).single(),
    supabase.from("case_diagnoses").select("id, is_primary, icd_codes(id, code, system, description_full, mapping_key)").eq("case_id", id),
    supabase
      .from("icd_codes")
      .select("id, code, system, description_full, mapping_key")
      .eq("active", true)
      .order("mapping_key")
      .order("system")
      .order("code"),
    supabase.from("term_library").select("id, stage, term").eq("active", true).order("sort_order"),
    supabase
      .from("case_term_records")
      .select("id, stage, recorded_at, recorded_by, case_term_record_items(term_library(term))")
      .eq("case_id", id)
      .order("recorded_at", { ascending: false }),
    supabase.from("treatment_types").select("id, name, field_schema").eq("active", true).order("sort_order"),
    supabase.from("treatment_presets").select("id, treatment_type_id, name, field_values").eq("active", true),
    supabase
      .from("treatment_records")
      .select(
        "id, treatment_type_id, treatment_date, body_site, lesion_id, field_values, free_text, recorded_by, recurrence_observed, recurrence_description, blood_drawn, blood_drawn_note, symptom_change_option_id, treatment_types(name)"
      )
      .eq("case_id", id)
      .order("treatment_date", { ascending: false }),
    supabase.from("case_schedule_items").select("*").eq("case_id", id).order("due_date"),
    supabase
      .from("questionnaire_responses")
      .select(
        "id, submitted_at, submitted_via, questionnaire_templates(id, name), questionnaire_answers(answer_value, questionnaire_questions(order_no, question_text, question_type, options))"
      )
      .eq("case_id", id)
      .order("submitted_at", { ascending: false }),
    supabase.from("photos").select("id, taken_at, body_site, lesion_id, file_path, thumbnail_path").eq("case_id", id).order("taken_at", { ascending: false }),
    supabase.from("case_data_completeness").select("*").eq("case_id", id),
    supabase.from("radiotherapy_dose_protocols").select("dose_category, fraction_count, per_fraction_dose_cgy"),
    supabase.from("radiotherapy_doctors").select("name").eq("active", true).order("sort_order").order("name"),
    supabase.from("v_case_pipeline_progress").select("*").eq("case_id", id).single(),
    supabase.from("body_part_zones").select("id, zone_key, view, display_name, dose_category").eq("active", true).order("sort_order"),
    supabase
      .from("radiotherapy_sessions")
      .select("*, case_keloid_lesions(site_no, body_site)")
      .eq("case_id", id)
      .order("due_date"),
    supabase.from("biobank_checklist_items").select("*").eq("case_id", id),
    supabase.from("biobank_samples").select("*").eq("case_id", id).maybeSingle(),
    supabase.from("case_intake_option_lists").select("id, category, label").eq("active", true).order("sort_order"),
    supabase
      .from("case_intake_option_records")
      .select("id, category, recorded_at, recorded_by, notes, case_intake_option_record_items(case_intake_option_lists(label))")
      .eq("case_id", id)
      .order("recorded_at", { ascending: false }),
    supabase.from("lab_marker_definitions").select("id, display_name, unit").eq("active", true).order("sort_order"),
    supabase
      .from("lab_results")
      .select("id, sample_date, value, value_text, note, recorded_by, lab_marker_definitions(display_name, unit)")
      .eq("case_id", id)
      .order("sample_date", { ascending: false }),
    supabase.from("questionnaire_templates").select("id").eq("name", "JSS 疤痕診斷分類表").maybeSingle(),
    supabase
      .from("case_keloid_lesions")
      .select("*, body_part_zones(display_name, dose_category)")
      .eq("case_id", id)
      .order("site_no"),
    supabase
      .from("questionnaire_templates")
      .select("id, name, category, required_for_intake")
      .eq("active", true)
      .order("created_at"),
    supabase.from("case_patient_intake_progress").select("segment_key, completed_at, filled_via").eq("case_id", id),
    supabase
      .from("case_intake_followups")
      .select("id, field_key, field_label, reason, patient_answer, status, staff_note, resolved_by, resolved_at")
      .eq("case_id", id)
      .order("created_at"),
  ]);

  if (!caseRow) {
    return <p className="text-sm text-red-600">找不到此個案</p>;
  }

  const doctor = Array.isArray(caseRow.doctors) ? caseRow.doctors[0] : caseRow.doctors;
  const biobankByKey = new Map((biobankItems ?? []).map((b) => [b.item_key, b]));
  // const termsByStage: Record<string, { id: string; term: string }[]> = { pre: [], intra: [], post: [] };
  // (termLibrary ?? []).forEach((t) => termsByStage[t.stage]?.push(t));

  // 部位＝病灶清單（決策 2026-07-27 多部位整合，不再有個案層級的單一「主要部位」）。
  // 每個病灶各自的 body_part_zone 決定它自己的放療劑量分類。
  const lesionList = (keloidLesions ?? []).map((l) => {
    const zone = Array.isArray(l.body_part_zones) ? l.body_part_zones[0] : l.body_part_zones;
    return {
      ...l,
      doseCategory: (zone?.dose_category as string | undefined) ?? null,
      doseCategoryLabel: zone?.dose_category ? DOSE_CATEGORY_LABEL[zone.dose_category] : null,
    };
  });
  // 各劑量分類的預設療程（胸/肩胛 1800cGy×3、耳 800cGy×1、其他 1500cGy×2）。
  // 帶到治療表單當預設值，讓使用者在勾部位時就看到「會排幾次、每次多少」並可當場改。
  const protocolByCategory = new Map(
    (doseProtocols ?? []).map((p) => [p.dose_category as string, { fractions: p.fraction_count as number, doseCgy: p.per_fraction_dose_cgy as number }])
  );

  const lesionLabel = (lesionId: string | null | undefined) => {
    const l = lesionList.find((x) => x.id === lesionId);
    return l ? `部位${l.site_no} ${l.body_site}` : null;
  };

  // 病人自填的分段進度與待補缺口（決策 2026-07-29）
  const patientIntakeBySegment = new Map(
    (patientIntakeProgress ?? []).map((p) => [p.segment_key as string, p])
  );
  const patientIntakeDone = PATIENT_INTAKE_SEGMENTS.filter((s) => patientIntakeBySegment.has(s.key)).length;
  const pendingFollowups = (intakeFollowups ?? []).filter((f) => f.status === "pending");

  const familyDiseaseOptions = (intakeOptions ?? []).filter((o) => o.category === "family_disease");
  const keloidHistoryTypeOptions = (intakeOptions ?? []).filter((o) => o.category === "keloid_history_type");
  const keloidHistoryRecords = (intakeRecords ?? []).filter((r) => r.category === "keloid_history_type");

  function extractAnswers(r: {
    questionnaire_answers?: { answer_value: unknown; questionnaire_questions: { order_no?: number } | { order_no?: number }[] | null }[];
  }): Record<number, unknown> {
    const answers: Record<number, unknown> = {};
    for (const a of r.questionnaire_answers ?? []) {
      const question = Array.isArray(a.questionnaire_questions) ? a.questionnaire_questions[0] : a.questionnaire_questions;
      if (question?.order_no !== undefined) answers[question.order_no] = a.answer_value;
    }
    return answers;
  }

  /**
   * 把一筆問卷回覆攤成「題號／題目／作答（已翻成選項文字）」，供逐題檢視用。
   * 選項題存的是 value，直接顯示會是一串代碼（例如 "3"），所以要對回 options 的 label。
   */
  function answerRows(r: {
    questionnaire_answers?: {
      answer_value: unknown;
      questionnaire_questions:
        | { order_no?: number; question_text?: string; question_type?: string; options?: unknown }
        | { order_no?: number; question_text?: string; question_type?: string; options?: unknown }[]
        | null;
    }[];
  }) {
    const rows: { orderNo: number; text: string; answer: string }[] = [];
    for (const a of r.questionnaire_answers ?? []) {
      const q = Array.isArray(a.questionnaire_questions) ? a.questionnaire_questions[0] : a.questionnaire_questions;
      if (!q || q.order_no === undefined) continue;
      const opts = (q.options ?? []) as { value?: string; label?: string }[];
      const toLabel = (v: unknown) => {
        const hit = opts.find((o) => String(o.value) === String(v));
        return hit?.label ? `${hit.label}` : String(v ?? "");
      };
      const raw = a.answer_value;
      const answer = Array.isArray(raw) ? raw.map(toLabel).join("、") : toLabel(raw);
      rows.push({ orderNo: q.order_no, text: q.question_text ?? "", answer });
    }
    return rows.sort((x, y) => x.orderNo - y.orderNo);
  }

  // wound-photos 是私有 bucket，圖片一律透過 /api/photos/<id> 取得（該路由在瀏覽器實際載入圖片的
  // 當下才即時簽一張短效期網址並轉址），所以這裡的網址永不過期，頁面停留再久都不會壞圖。
  // grid 用 ?variant=thumb 縮圖（流量小），點開大圖才載原圖；舊照片沒有縮圖時路由端 fallback 用原圖。
  const photosWithUrl = (photos ?? []).map((p) => ({
    ...p,
    imageUrl: `/api/photos/${p.id}`,
    thumbUrl: `/api/photos/${p.id}?variant=thumb`,
  }));

  // 放療療程分組：一個部位的一次手術＝一組療程（同一部位再次手術會是另一組），
  // 以「病灶 + 觸發的手術紀錄」當分組鍵。舊資料沒有 lesion_id 時歸到「未指定部位」那組。
  // 放射科醫師名單來自後台的獨立清單（/admin/rt-doctors，助理 2026-08-13 D9 指定）。
  // 逐次放療待辦標記完成時可以選——那是實際執行時真正會用到的路徑。
  const rtDoctorOptions = (rtDoctors ?? []).map((d) => d.name as string);
  // 同一個案先前已填過的醫師，當作下一次的預設值（同一療程通常是同一位）
  const lastRtDoctor = (radiotherapySessions ?? []).map((s) => (s as { rt_doctor?: string }).rt_doctor).filter(Boolean).pop() ?? "";

  type RtSession = {
    id: string;
    lesion_id: string | null;
    triggered_by_treatment_record_id: string | null;
    dose_category: string;
    fraction_no: number;
    total_fractions: number;
    planned_dose_cgy: number;
    actual_dose_cgy: number | null;
    rt_doctor: string | null;
    due_date: string;
    completed_date: string | null;
    status: string;
  };
  const rtSessionsByCourse = new Map<string, RtSession[]>();
  for (const s of (radiotherapySessions ?? []) as RtSession[]) {
    const key = `${s.lesion_id ?? "none"}__${s.triggered_by_treatment_record_id ?? "none"}`;
    rtSessionsByCourse.set(key, [...(rtSessionsByCourse.get(key) ?? []), s]);
  }
  const rtCourses = Array.from(rtSessionsByCourse).map(([key, sessions]) => {
    const sorted = [...sessions].sort((a, b) => a.fraction_no - b.fraction_no);
    return {
      key,
      title: lesionLabel(sorted[0].lesion_id) ?? "未指定部位",
      doseCategory: sorted[0].dose_category,
      sessions: sorted,
      doneCount: sorted.filter((s) => s.status === "done").length,
      startDate: sorted[0].due_date,
    };
  });

  // 照片依病灶部位分組，縮圖直接顯示在該部位底下（決策 2026-07-28：取消獨立的「傷口照片」card）。
  const photosByLesion = Object.fromEntries(
    lesionList.map((l) => [l.id, photosWithUrl.filter((p) => p.lesion_id === l.id)])
  );
  // 新拍的照片一律會掛到部位（見 uploadPhotoAction），這裡只剩舊資料可能沒對應
  const unassignedPhotos = photosWithUrl.filter(
    (p) => !p.lesion_id || !lesionList.some((l) => l.id === p.lesion_id)
  );

  // 應填問卷清單（決策 2026-07-28）：後台在「問卷產生器」勾選哪些問卷是正式上線要填的
  // （questionnaire_templates.required_for_intake），個案頁面就照這份清單列出待填/已完成，
  // 不用再靠人記得有哪幾份。已填＝這個個案對該問卷至少有一筆回覆。
  const responseCountByTemplate = new Map<string, { count: number; latest: string }>();
  for (const r of responses ?? []) {
    const q = Array.isArray(r.questionnaire_templates) ? r.questionnaire_templates[0] : r.questionnaire_templates;
    if (!q?.id) continue;
    const prev = responseCountByTemplate.get(q.id);
    responseCountByTemplate.set(q.id, {
      count: (prev?.count ?? 0) + 1,
      latest: prev && prev.latest > r.submitted_at ? prev.latest : r.submitted_at,
    });
  }
  const requiredQuestionnaires = (questionnaireTemplates ?? [])
    .filter((t) => t.required_for_intake)
    .map((t) => ({ ...t, done: responseCountByTemplate.get(t.id) }));

  // JSS 疤痕診斷分類表（JSW Scar Scale 2015）：同一份量表每次追蹤重複施測，
  // 以個案最早一筆回覆的總分當基準，計算每筆回覆的 Delta Score（基準分-本次分，正值代表改善）。
  // （2026-07-27 決策：原本另有一份 6 題追蹤評估表，已刪除只留這份正式量表。）
  const jssDeltaById = new Map<string, number>();
  {
    const jssResponses = (responses ?? [])
      .filter((r) => {
        const q = Array.isArray(r.questionnaire_templates) ? r.questionnaire_templates[0] : r.questionnaire_templates;
        return q?.name === "JSS 疤痕診斷分類表";
      })
      .map((r) => ({ id: r.id, submitted_at: r.submitted_at, total: computeJSSClassification(extractAnswers(r))?.total ?? null }))
      .filter((r): r is { id: string; submitted_at: string; total: number } => r.total !== null)
      .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
    const baseline = jssResponses[0]?.total ?? null;
    if (baseline !== null) {
      for (const r of jssResponses) jssDeltaById.set(r.id, baseline - r.total);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/cases" className="text-sm text-ink/40 hover:underline">
          ← 回個案列表
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-xl font-semibold">{caseRow.research_id}</h1>
          {/* 姓名由瀏覽器端從本機對照表注入 */}
          <PatientName researchId={caseRow.research_id} className="text-lg text-ink/70" />
          {caseRow.data_source === "legacy_import" && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">舊資料回溯建檔</span>
          )}
        </div>
        <p className="mt-1 text-sm text-ink/50">
          負責醫師：{doctor?.code} {doctor?.name}
        </p>
        {/* LINE 綁定狀態擺在研究編號下方、一條龍上方（2026-07-29 使用者要求）：
            它是個案的整體狀態，不是某個要填的區塊。平常只是一顆徽章，要給病人掃碼時才展開。 */}
        <div className="mt-2">
          <LineBindingSection
            caseId={id}
            lineBound={!!caseRow.line_bound}
            lineBoundAt={caseRow.line_bound_at ?? null}
            bindCode={caseRow.line_bind_code ?? null}
            bindCodeExpiresAt={caseRow.line_bind_code_expires_at ?? null}
          />
        </div>
      </div>

      {/* 收案一條龍進度 */}
      {pipeline && <PipelineProgress row={pipeline as CasePipelineRow} />}

      {/* 資料完整度（僅舊資料回溯建檔的個案會有列）。
          跟一條龍是不同層次的東西：一條龍看的是「收案流程走到哪一步」，這裡看的是「逐個欄位有沒有值」，
          所以緊接在一條龍下方、預設收合，需要補資料時才展開（2026-07-28 使用者建議）。 */}
      {completeness && completeness.length > 0 && (
        <details
          id="section-completeness"
          data-nav-section
          data-nav-label="資料完整度追蹤"
          className="scroll-mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4"
        >
          <summary className="cursor-pointer text-sm font-semibold text-amber-800">
            資料完整度追蹤（回溯建檔）
            <span className="ml-2 font-data text-xs font-normal text-amber-700">
              待補 {completeness.filter((c) => c.status === "pending").length}
              {" ・ "}已有 {completeness.filter((c) => c.status === "has_value").length}
              {" ・ "}不適用 {completeness.filter((c) => c.status === "not_applicable").length}
            </span>
            <InfoTooltip text="僅舊資料回溯建檔的個案會顯示。一條龍看的是收案流程走到第幾步，這裡看的是逐個欄位有沒有值：標記「已有」「待補」或「不適用」，方便日後回頭補齊缺漏資料。" />
          </summary>
          <ul className="mt-2 space-y-2">
            {completeness.map((c) => {
              const anchor = COMPLETENESS_ANCHOR[c.field_key];
              return (
              <li key={c.id} className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm">
                <div>
                  {anchor ? (
                    <Link href={`#${anchor}`} className="font-medium text-brand-800 underline decoration-brand-300 underline-offset-2">
                      {c.field_label} ↓
                    </Link>
                  ) : (
                    <span className="font-medium">{c.field_label}</span>
                  )}
                  {c.note && <span className="ml-2 text-xs text-ink/40">{c.note}</span>}
                </div>
                <form action={updateCompletenessAction} className="flex items-center gap-2">
                  <input type="hidden" name="case_id" value={id} />
                  <input type="hidden" name="field_key" value={c.field_key} />
                  <select
                    name="status"
                    defaultValue={c.status}
                    className={`rounded px-2 py-1 text-xs ${COMPLETENESS_COLOR[c.status]}`}
                  >
                    <option value="has_value">已有</option>
                    <option value="pending">待補</option>
                    <option value="not_applicable">不適用</option>
                  </select>
                  <SubmitButton variant="ghost" size="sm" className="!px-1.5 !py-0.5 text-ink/40 underline" pendingText="更新中…">
                    更新
                  </SubmitButton>
                </form>
              </li>
              );
            })}
          </ul>
        </details>
      )}

      {/* 病人自填（決策 2026-07-29）：進度、待人員補完的缺口，以及交出平板的入口。
          放在診斷前面，是因為門診當下第一件事就是決定「這位要不要交平板給他填」。 */}
      <section id="section-patient-intake" data-nav-section data-nav-label="病人自填" className="scroll-mt-4 rounded-lg border border-brand-100 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink/80">
            病人自填
            <InfoTooltip text="把平板交給病人，依序填寫只有他自己知道答案的部分（基本資料、病史、發生原因、SF-36、PSQI）。臨床評分（VSS/JSS）、病灶尺寸、拍照仍由診間人員操作。病人答「不知道」或答「有」但問不到細節的項目，會列在下方待補清單。" />
          </h2>
          <Link
            href={`/patient/${id}/intake`}
            className="whitespace-nowrap rounded-md bg-brand-700 px-3 py-1.5 text-xs text-white hover:bg-brand-800"
          >
            {patientIntakeDone === 0 ? "交給病人填" : patientIntakeDone < PATIENT_INTAKE_SEGMENTS.length ? "繼續填" : "重新填寫"}
          </Link>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PATIENT_INTAKE_SEGMENTS.map((s) => {
            const done = patientIntakeBySegment.get(s.key);
            return (
              <span
                key={s.key}
                title={done ? `${new Date(done.completed_at).toLocaleString("zh-TW")} 由${done.filled_via === "patient" ? "病人自填" : "人員代填"}` : s.hint}
                className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                  done ? "bg-emerald-100 text-emerald-700" : "bg-ink/5 text-ink/40"
                }`}
              >
                {done ? "✓ " : ""}
                {s.label}
              </span>
            );
          })}
          <span className="font-data text-xs text-ink/40">
            {patientIntakeDone}/{PATIENT_INTAKE_SEGMENTS.length} 段
          </span>
        </div>

        {(intakeFollowups ?? []).length > 0 && (
          <div className="mt-3 border-t border-brand-50 pt-3">
            <h3 className="mb-1.5 text-xs font-semibold text-ink/60">
              待人員補完
              <span className="ml-2 font-data font-normal text-ink/40">
                未處理 {pendingFollowups.length} / 共 {(intakeFollowups ?? []).length}
              </span>
              <InfoTooltip text="病人版沒有自由文字輸入（長輩在平板上打中文幾乎不可能），所以答「不知道」、答「有」但沒問到細節、或跳過的項目集中列在這裡，由護理師/助理問診時追問後補完。答「無」是有效答案，不會列進來。" />
            </h3>
            <ul className="space-y-1.5">
              {(intakeFollowups ?? []).map((f) => (
                <li
                  key={f.id}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    f.status === "resolved" ? "border-brand-50 bg-ink/[0.02]" : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={f.status === "resolved" ? "text-ink/40 line-through" : "font-medium text-ink"}>
                      {f.field_label}
                    </span>
                    <span className="whitespace-nowrap rounded bg-white px-1.5 py-0.5 text-xs text-ink/50">
                      {FOLLOWUP_REASON_LABEL[f.reason] ?? f.reason}
                    </span>
                    {f.patient_answer && (
                      <span className="whitespace-nowrap text-xs text-ink/40">病人答：{f.patient_answer}</span>
                    )}
                    {f.status === "resolved" && (
                      <span className="whitespace-nowrap text-xs text-emerald-700">
                        ✓ {f.resolved_by}
                        {f.staff_note ? ` ・${f.staff_note}` : ""}
                      </span>
                    )}
                  </div>
                  {f.status === "pending" && (
                    <form action={resolveFollowupAction} className="mt-1.5 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="case_id" value={id} />
                      <input type="hidden" name="followup_id" value={f.id} />
                      <input
                        name="staff_note"
                        placeholder="補問到的內容（選填，詳細資料請填到對應欄位）"
                        className="min-w-0 flex-1 rounded border border-brand-200 px-2 py-1 text-xs"
                      />
                      <SubmitButton variant="outline" size="sm" className="!px-2 !py-0.5 !text-xs" pendingText="處理中…">
                        標記已補
                      </SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ICD 診斷（決策 2026-07-28：診斷是看診當下最先要確認的事，移到所有區塊最前面） */}
      <section id="section-diagnosis" data-nav-section data-nav-label="診斷（ICD-9/10）" className="scroll-mt-4 rounded-lg border border-brand-100 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink/80">
          診斷（ICD-9/10）
          <InfoTooltip text="用上方的 ICD-9 / ICD-10 開關切換要用哪個系統：選單只列出該系統的碼，已記錄的診斷也會換算成該系統顯示，對照碼附在後方。對照關係於後台 ICD 維護頁設定。" />
        </h2>
        <DiagnosisSection
          caseId={id}
          codes={icdCodes ?? []}
          diagnoses={(diagnoses ?? []).map((d) => ({
            id: d.id,
            is_primary: d.is_primary,
            icd: (Array.isArray(d.icd_codes) ? d.icd_codes[0] : d.icd_codes) ?? null,
          }))}
        />
      </section>

      {/* 病人基本資料（舊資料對齊欄位） */}
      <section id="section-demographics" data-nav-section data-nav-label="病人基本資料" className="scroll-mt-4 rounded-lg border border-brand-100 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink/80">
          病人基本資料
          <InfoTooltip text="記錄性別、年齡、手機、JSW score、家族史、keloid 病史與大小，供研究資料分析使用，可隨時回來更新。手機僅供 LINE 綁定通知，不存姓名/病歷號。" />
          <PatientFilledBadge entry={patientIntakeBySegment.get("basic")} />
        </h2>
        <form action={updateDemographicsAction} className="grid grid-cols-2 gap-3 text-sm">
          <input type="hidden" name="case_id" value={id} />
          <div>
            <label className="block text-xs font-medium text-ink/70">性別</label>
            <select name="sex" defaultValue={caseRow.sex ?? ""} className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm">
              <option value="">未填</option>
              <option value="F">女</option>
              <option value="M">男</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70">年齡</label>
            <input
              type="number"
              name="age_at_enrollment"
              defaultValue={caseRow.age_at_enrollment ?? ""}
              className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70">出生日期</label>
            <input
              type="date"
              name="birth_date"
              defaultValue={caseRow.birth_date ?? ""}
              className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
          </div>
          {/* 身高體重（2026-08-13）：新格式 Basic Info. 有 height/weight/BMI 三欄，
              BMI 由匯出時自動計算，不在這裡另存欄位以免與身高體重不同步。 */}
          <div>
            <label className="block text-xs font-medium text-ink/70">身高（cm）</label>
            <input
              name="height_cm"
              type="number"
              step="0.1"
              inputMode="decimal"
              defaultValue={caseRow.height_cm ?? ""}
              className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70">體重（kg）</label>
            <input
              name="weight_kg"
              type="number"
              step="0.1"
              inputMode="decimal"
              defaultValue={caseRow.weight_kg ?? ""}
              className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70">手機號碼</label>
            <input
              name="phone_number"
              type="tel"
              inputMode="tel"
              defaultValue={caseRow.phone_number ?? ""}
              placeholder="供 LINE 綁定通知使用（不存姓名/病歷號）"
              className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70">JSW score</label>
            <input
              name="jsw_score"
              defaultValue={caseRow.jsw_score ?? ""}
              className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
            {!caseRow.jsw_score && jssClassificationTemplate && (
              <Link
                href={`/patient/${id}/questionnaire?questionnaire_id=${jssClassificationTemplate.id}`}
                className="mt-1 inline-block text-xs text-blue-600 underline"
              >
                尚未填寫，點此互動式填寫 JSS 疤痕診斷分類表 →
              </Link>
            )}
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-ink/70">Family（家族史）</label>
            <FamilyHistoryPicker name="family_history" title="選擇家族病史" options={familyDiseaseOptions} defaultValue={caseRow.family_history ?? ""} />
          </div>
          <SubmitButton className="col-span-2" pendingText="更新中…">
            更新基本資料
          </SubmitButton>
        </form>

        <div className="mt-4 border-t border-brand-50 pt-3">
          <label className="block text-xs font-medium text-ink/70">
            Keloid history（勾選病史類型，並填寫部位/時間/治療等詳細內容）
          </label>
          <div className="mt-1">
            <IntakeOptionForm
              caseId={id}
              category="keloid_history_type"
              options={keloidHistoryTypeOptions}
              alwaysShowNotes
              notesPlaceholder="請描述部位、時間、治療方式等詳細內容"
            />
          </div>
          <ul className="space-y-1">
            <CollapsedList listClassName="space-y-1" label="病史紀錄">
              {keloidHistoryRecords.map((r) => (
                <li key={r.id} className="break-words text-xs text-ink/50">
                  {new Date(r.recorded_at).toLocaleDateString("zh-TW")} ・ {r.recorded_by} ・{" "}
                  {(r.case_intake_option_record_items ?? [])
                    .map((it: { case_intake_option_lists: { label: string } | { label: string }[] }) =>
                      Array.isArray(it.case_intake_option_lists) ? it.case_intake_option_lists[0]?.label : it.case_intake_option_lists?.label
                    )
                    .join("、") || "（無勾選項目）"}
                  {r.notes && <span className="text-ink/40">（{r.notes}）</span>}
                </li>
              ))}
            </CollapsedList>
            {keloidHistoryRecords.length === 0 && <li className="text-xs text-ink/30">尚無紀錄</li>}
          </ul>
        </div>

        <div className="mt-4 border-t border-brand-50 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink/60">
              蟹足腫部位與大小
              <InfoTooltip text="在人形圖點選部位即可帶入病灶部位與劑量分類。每個部位各自跑自己的放射治療排程（胸/肩胛區18Gy×3、耳8Gy×1、其他部位15Gy×2）。" />
            </span>
            <Link
              href={`/patient/${id}/photo`}
              className="whitespace-nowrap rounded-md bg-brand-700 px-3 py-1.5 text-xs text-white hover:bg-brand-800"
            >
              立即拍照
            </Link>
          </div>
          <KeloidLesionSection
            caseId={id}
            lesions={lesionList}
            zones={bodyZones ?? []}
            sex={caseRow.sex}
            photosByLesion={photosByLesion}
            unassignedPhotos={unassignedPhotos}
          />
        </div>
      </section>

      {/* 病史與過往治療 */}
      <section id="section-priorhistory" data-nav-section data-nav-label="病史與過往治療" className="scroll-mt-4 rounded-lg border border-brand-100 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink/80">
          病史與過往治療
          <InfoTooltip text="記錄蟹足腫初次發生時間、一般疾病史，以及收案「前」曾在其他院所/自行嘗試過的治療（跟下方治療紀錄追蹤的是收案後的治療不同）。" />
          <PatientFilledBadge entry={patientIntakeBySegment.get("history")} />
        </h2>
        <form action={updatePriorHistoryAction} className="grid grid-cols-2 gap-3 text-sm">
          <input type="hidden" name="case_id" value={id} />
          <div>
            <label className="block text-xs font-medium text-ink/70">蟹足腫初次發生時間</label>
            <input
              type="date"
              name="keloid_onset_date"
              defaultValue={caseRow.keloid_onset_date ?? ""}
              className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70">之前治療的醫師（可多位）</label>
            <MultiEntryInput
              name="prior_treatment_physician"
              defaultValue={caseRow.prior_treatment_physician}
              placeholder="醫師姓名／院所"
              addLabel="＋ 新增一位醫師"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-ink/70">疾病史（一般病史）</label>
            <FamilyHistoryPicker name="disease_history" title="選擇疾病史" options={familyDiseaseOptions} defaultValue={caseRow.disease_history ?? ""} />
          </div>
          <PriorTreatmentPicker name="prior_steroid_treatment" label="之前類固醇注射治療" defaultValue={caseRow.prior_steroid_treatment ?? ""} />
          <PriorTreatmentPicker name="prior_tcm_treatment" label="之前中醫治療" defaultValue={caseRow.prior_tcm_treatment ?? ""} />
          <PriorTreatmentPicker name="prior_ogawa_patch" label="之前小川令貼布使用史" defaultValue={caseRow.prior_ogawa_patch ?? ""} />
          <PriorTreatmentPicker name="prior_radiation_treatment" label="之前放射線治療史" defaultValue={caseRow.prior_radiation_treatment ?? ""} />
          <SubmitButton className="col-span-2" pendingText="更新中…">
            更新病史與過往治療
          </SubmitButton>
        </form>
      </section>

      {/* 發生原因 / 得知看診資訊 / 飲食運動衛教（後台可維護選單，決策 2026-07-27） */}
      <section id="section-intake" data-nav-section data-nav-label="發生原因與看診來源" className="scroll-mt-4 rounded-lg border border-brand-100 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink/80">
          就診原因 / 發生原因 / 得知看診資訊 / 目前症狀
          <InfoTooltip text="四類選單皆為後台可維護清單（非單純勾選），可複選並保留歷次紀錄。「目前不適症狀」的『無明顯不適』與其他選項互斥。衛教內容不在此記錄，改由後台「衛教資料庫」維護供 LINE 衛教機器人參考。" />
        </h2>
        {INTAKE_CATEGORIES.map((cat) => {
          const options = (intakeOptions ?? []).filter((o) => o.category === cat.key);
          const records = (intakeRecords ?? []).filter((r) => r.category === cat.key);
          return (
            <div key={cat.key} className="mb-4 last:mb-0">
              <h3 className="mb-1 text-xs font-semibold text-ink/50">{cat.label}</h3>
              <IntakeOptionForm
                caseId={id}
                category={cat.key}
                options={options}
                exclusiveLabel={EXCLUSIVE_OPTION_BY_CATEGORY[cat.key]}
              />
              <ul className="space-y-1">
                <CollapsedList listClassName="space-y-1" label={cat.label}>
                  {records.map((r) => (
                    <li key={r.id} className="break-words text-xs text-ink/50">
                      {new Date(r.recorded_at).toLocaleDateString("zh-TW")} ・ {r.recorded_by} ・{" "}
                      {(r.case_intake_option_record_items ?? [])
                        .map((it: { case_intake_option_lists: { label: string } | { label: string }[] }) =>
                          Array.isArray(it.case_intake_option_lists) ? it.case_intake_option_lists[0]?.label : it.case_intake_option_lists?.label
                        )
                        .join("、") || "（無勾選項目）"}
                      {r.notes && <span className="text-ink/40">（{r.notes}）</span>}
                    </li>
                  ))}
                </CollapsedList>
                {records.length === 0 && <li className="text-xs text-ink/20">尚無紀錄</li>}
              </ul>
            </div>
          );
        })}
      </section>

      {/* 醫學術語紀錄 —— 2026-08-13 暫時停用（先註記掉，未移除）
          原因：對照部長的收案 Excel，四張表都沒有需要用到術語紀錄的欄位，
          填了不會進匯出檔，等於是只給人看的自由紀錄，實務上沒有填的必要。
          保留下列程式碼與後台「醫學術語庫」維護頁，之後若要恢復，
          把這段註解解掉即可（資料表 case_term_records 與既有資料都沒有動）。

      <section id="section-terms" data-nav-section data-nav-label="醫學術語紀錄" className="scroll-mt-4 rounded-lg border border-brand-100 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink/80">
          醫學術語紀錄
          <InfoTooltip text="依術前/術中/術後選擇該階段觀察到的常用術語（可複選），用於統一病歷描述用語，方便後續資料分析比對。" />
        </h2>
        <TermRecordForm caseId={id} terms={termLibrary ?? []} />
        <ul className="space-y-1">
          <CollapsedList listClassName="space-y-1" label="術語紀錄">
            {(termRecords ?? []).map((r) => (
              <li key={r.id} className="text-sm text-ink/70">
                <span className="font-medium">{STAGE_LABEL[r.stage]}</span>（{new Date(r.recorded_at).toLocaleString("zh-TW")} ・{r.recorded_by}）：
                {(r.case_term_record_items ?? [])
                  .map((it: { term_library: { term: string } | { term: string }[] }) =>
                    Array.isArray(it.term_library) ? it.term_library[0]?.term : it.term_library?.term
                  )
                  .join("、") || "（無術語）"}
              </li>
            ))}
          </CollapsedList>
          {(!termRecords || termRecords.length === 0) && <li className="text-sm text-ink/40">尚無紀錄</li>}
        </ul>
      </section>
      */}

      {/* 治療紀錄 */}
      <section id="section-treatment" data-nav-section data-nav-label="治療紀錄" className="scroll-mt-4 rounded-lg border border-brand-100 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink/80">
          治療紀錄
          <InfoTooltip text="選擇治療類型並填寫對應欄位；若有常用套組可直接選擇帶入數值，再視情況微調後儲存。若登打「手術切除」且已標記部位，會自動產生放射治療排程。" />
        </h2>
        <div className="mb-4">
          <TreatmentForm
            caseId={id}
            treatmentTypes={treatmentTypes ?? []}
            presets={presets ?? []}
            lesions={lesionList.map((l) => ({
              id: l.id,
              site_no: l.site_no,
              body_site: l.body_site,
              doseCategoryLabel: l.doseCategoryLabel,
              rtPlan: l.doseCategory ? protocolByCategory.get(l.doseCategory) ?? null : null,
            }))}
            symptomChangeOptions={(intakeOptions ?? [])
              .filter((o) => o.category === "symptom_change")
              .map((o) => ({ id: o.id, label: o.label }))}
            rtDoctorOptions={rtDoctorOptions}
          />
        </div>
        <TreatmentRecordList
          caseId={id}
          records={(treatmentRecords ?? []).map((r) => {
            const tt = Array.isArray(r.treatment_types) ? r.treatment_types[0] : r.treatment_types;
            return {
              id: r.id,
              treatment_type_id: r.treatment_type_id,
              typeName: tt?.name ?? null,
              treatment_date: r.treatment_date,
              body_site: r.body_site,
              lesion_id: r.lesion_id,
              field_values: r.field_values,
              free_text: r.free_text,
              recorded_by: r.recorded_by,
              recurrence_observed: r.recurrence_observed,
              recurrence_description: r.recurrence_description,
              blood_drawn: r.blood_drawn,
              blood_drawn_note: r.blood_drawn_note,
              symptom_change_option_id: r.symptom_change_option_id,
            };
          })}
          fieldSchemas={Object.fromEntries((treatmentTypes ?? []).map((t) => [t.id, t.field_schema ?? []]))}
          symptomChangeOptions={(intakeOptions ?? [])
            .filter((o) => o.category === "symptom_change")
            .map((o) => ({ id: o.id, label: o.label }))}
        />
      </section>

      {/* 放射治療進度（登打「手術切除」且已標記部位後自動產生） */}
      <section id="section-radiotherapy" data-nav-section data-nav-label="放射治療進度" className="scroll-mt-4 rounded-lg border border-brand-100 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink/80">
          放射治療進度
          <InfoTooltip text="登打「手術切除」治療紀錄時，該筆對應部位若已指定部位分類就自動產生一組療程（胸/肩胛區18Gy×3、耳8Gy×1、其他部位15Gy×2）。多個部位各自跑各自的療程。第 1 次須在術後 24 小時內（排在手術隔天），之後每天一次不間斷。每次實際執行後在此標記完成並填實際劑量。手術日期若回頭修改，尚未完成的排程日期會自動跟著移。" />
        </h2>
        {rtCourses.length > 0 ? (
          <div className="space-y-4">
            {rtCourses.map((course) => (
              <div key={course.key}>
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-ink/70">{course.title}</span>
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-700">
                    {DOSE_CATEGORY_LABEL[course.doseCategory] ?? course.doseCategory}
                  </span>
                  <span className="text-ink/40">
                    完成 {course.doneCount}/{course.sessions.length} 次
                    {course.startDate && ` ・ 起始 ${course.startDate}`}
                  </span>
                </div>
                <ul className="space-y-2">
                  {course.sessions.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-50 px-3 py-2 text-sm">
                      <span className="whitespace-nowrap">
                        第 {s.fraction_no}/{s.total_fractions} 次 ・ 預定 {s.planned_dose_cgy / 100}Gy ・ 到期 {s.due_date}
                        {/* 第 1 次有臨床時效（術後 24 小時內），與後續每日一次的性質不同，標出來免得被當成一般待辦往後拖 */}
                        {s.fraction_no === 1 && s.status !== "done" && (
                          <span className="ml-2 whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                            須於術後 24 小時內
                          </span>
                        )}
                        {s.status === "done" && s.actual_dose_cgy != null && (
                          <span className="ml-2 whitespace-nowrap text-xs text-emerald-600">
                            實際 {s.actual_dose_cgy / 100}Gy（{s.completed_date}）{s.rt_doctor ? `・${s.rt_doctor}` : ""}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                            s.status === "done"
                              ? "bg-emerald-100 text-emerald-700"
                              : s.status === "skipped"
                              ? "bg-ink/10 text-ink/50"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {s.status === "done" ? "已完成" : s.status === "skipped" ? "已跳過" : "待處理"}
                        </span>
                        {s.status === "pending" && (
                          <form action={markRadiotherapySessionAction} className="flex items-center gap-1">
                            <input type="hidden" name="case_id" value={id} />
                            <input type="hidden" name="session_id" value={s.id} />
                            <input type="hidden" name="status" value="done" />
                            {/* 實際治療日期（docx 項次 10）：預設帶排定日，補登時可改成真正做的那天 */}
                            <input
                              type="date"
                              name="completed_date"
                              defaultValue={s.due_date ?? undefined}
                              title="實際治療日期"
                              className="rounded border border-brand-200 px-1 py-0.5 text-xs"
                            />
                            <input
                              type="number"
                              name="actual_dose_cgy"
                              placeholder={`${s.planned_dose_cgy}`}
                              defaultValue={s.planned_dose_cgy}
                              className="w-20 rounded border border-brand-200 px-1 py-0.5 text-xs"
                            />
                            {rtDoctorOptions.length > 0 && (
                              <select
                                name="rt_doctor"
                                defaultValue={s.rt_doctor ?? lastRtDoctor}
                                title="放射科醫師"
                                className="rounded border border-brand-200 px-1 py-0.5 text-xs"
                              >
                                <option value="">放射科醫師</option>
                                {rtDoctorOptions.map((d) => (
                                  <option key={d} value={d}>
                                    {d}
                                  </option>
                                ))}
                              </select>
                            )}
                            <SubmitButton variant="ghost" size="sm" className="!px-1.5 !py-0.5 text-ink/40 underline" pendingText="處理中…">
                              標記完成
                            </SubmitButton>
                          </form>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink/40">
            尚無放療排程。登打「手術切除」治療紀錄時，勾選的部位若已在病灶清單指定部位分類，系統會為每個部位各產生一組排程。
          </p>
        )}
      </section>

      {/* 生物資料庫 */}
      <section id="section-biobank" data-nav-section data-nav-label="同意書與生物資料庫" className="scroll-mt-4 rounded-lg border border-brand-100 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink/80">
          生物資料庫
          <InfoTooltip text="勾選蠟塊、Keloid/Periskin fibroblast 原代培養、術前與術後第一天血液是否已收取，並記錄日期；可分次事後補填，不用一次填完。" />
        </h2>

        {/* 知情同意書（決策 2026-07-28：同意書是收檢體的前提，整併到生物資料庫最前面，
            不再是獨立 card。id 保留 section-consent，一條龍與完整度清單的錨點才不會失效） */}
        <div id="section-consent" className="mb-3 scroll-mt-4 rounded-md border border-accent-200 bg-accent-50 p-3">
          <h3 className="mb-1.5 text-xs font-semibold text-ink/70">
            知情同意書簽署
            <InfoTooltip text="紙本簽署流程不變，這裡只記錄簽署日期與確認人，作為系統內的狀態追蹤，不影響實際同意書效力。收取檢體前應先確認已簽署。" />
          </h3>
          <form action={updateConsentAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="case_id" value={id} />
            <input
              type="date"
              name="consent_signed_at"
              defaultValue={caseRow.consent_signed_at ?? ""}
              className="rounded-md border border-accent-300 px-2 py-1.5 text-sm"
            />
            <SubmitButton pendingText="設定中…">更新</SubmitButton>
            <span
              className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                caseRow.consent_signed_at ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {caseRow.consent_signed_at ? "已簽署" : "尚未簽署"}
            </span>
            <span className="text-xs text-ink/40">
              {caseRow.consent_signed_at
                ? `已由 ${caseRow.consent_confirmed_by} 確認`
                : "紙本簽署流程不變，此僅為狀態記錄"}
            </span>
          </form>
        </div>

        <form action={updateLegacyBiobankAction} className="mb-3 flex flex-wrap items-end gap-3 rounded-md border border-brand-50 p-3 text-sm">
          <input type="hidden" name="case_id" value={id} />
          <div>
            <label className="block text-xs font-medium text-ink/70">蠟塊編號</label>
            <input
              name="paraffin_block_no"
              defaultValue={legacyBiobank?.paraffin_block_no ?? ""}
              className="mt-1 rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70">細胞量</label>
            <input
              name="cell_quantity"
              defaultValue={legacyBiobank?.cell_quantity ?? ""}
              className="mt-1 rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70">儲存盤數</label>
            <input
              name="storage_plate_count"
              defaultValue={legacyBiobank?.storage_plate_count ?? ""}
              className="mt-1 rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70">凍管位置</label>
            <input
              name="cryotube_location"
              defaultValue={legacyBiobank?.cryotube_location ?? ""}
              className="mt-1 rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
          </div>
          <SubmitButton variant="outline" pendingText="更新中…">
            更新
          </SubmitButton>
        </form>
        {(["組織", "血液"] as const).map((group) => (
          <div key={group} className="mb-3 last:mb-0">
            <h3 className="mb-1 text-xs font-semibold text-ink/50">{group}</h3>
            <ul className="space-y-1">
              {BIOBANK_ITEMS.filter((it) => it.group === group).map((it) => {
                const existing = biobankByKey.get(it.key);
                return (
                  <li key={it.key} className="flex flex-wrap items-center gap-3 rounded-md border border-brand-50 px-3 py-1.5 text-sm">
                    <form action={updateBiobankChecklistAction} className="flex flex-1 flex-wrap items-center gap-3">
                      <input type="hidden" name="case_id" value={id} />
                      <input type="hidden" name="item_key" value={it.key} />
                      <input type="hidden" name="item_label" value={it.label} />
                      <label className="flex flex-1 items-center gap-2 whitespace-nowrap">
                        <input type="checkbox" name="collected" defaultChecked={existing?.collected ?? false} />
                        {it.label}
                      </label>
                      <input
                        type="date"
                        name="collected_date"
                        defaultValue={existing?.collected_date ?? new Date().toISOString().slice(0, 10)}
                        className="rounded border border-brand-200 px-1.5 py-1 text-xs"
                      />
                      <span
                        className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                          existing?.collected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {existing?.collected ? "已收" : "待收"}
                      </span>
                      <SubmitButton variant="ghost" size="sm" className="!px-1.5 !py-0.5 text-ink/40 underline" pendingText="更新中…">
                        更新
                      </SubmitButton>
                    </form>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      {/* Lab 生物標記數據 */}
      <section id="section-lab" data-nav-section data-nav-label="Lab 生物標記數據" className="scroll-mt-4 rounded-lg border border-brand-100 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink/80">
          Lab 生物標記數據
          <InfoTooltip text="記錄 IgE、Exosome、IL-1α/β、IL-6、TNF-α、MMP2/9 等生物標記檢驗結果，可依採檢日期多次登打；標記清單於後台「Lab 生物標記清單」維護。" />
        </h2>
        {/* 一次橫向列出所有標記、各自在下方填值後一次儲存（決策 2026-07-28）。
            原本是「選一個標記→填一個值→送出」，一次採檢要重複十幾次。
            手機每列 3 項自動換行，桌機依寬度放到 6 項。留空的項目不會建立資料列。 */}
        <form action={addLabResultsBatchAction} className="mb-3 space-y-3 rounded-md border border-brand-50 p-3 text-sm">
          <input type="hidden" name="case_id" value={id} />
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-ink/70">採檢日期（本次共用）</label>
              <input
                type="date"
                name="sample_date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="mt-1 rounded-md border border-brand-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="min-w-[160px] flex-1">
              <label className="block text-xs font-medium text-ink/70">備註（套用到本次所有項目）</label>
              <input name="note" className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
            </div>
          </div>

          {(labMarkers ?? []).length > 0 ? (
            <div className="grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-4 lg:grid-cols-6">
              {(labMarkers ?? []).map((m) => (
                <div key={m.id}>
                  <label className="block truncate text-xs font-medium text-ink/70" title={m.display_name}>
                    {m.display_name}
                  </label>
                  {/* 單位那一行一律佔位（目前只有 Exosome 沒有單位）——條件渲染會讓沒單位的那一格
                      少一行高度，輸入框就跟同一列其他格對不齊。
                      佔位字元必須是不斷行空白 U+00A0：一般空白會被摺疊掉，那一行仍然是 0 高度。 */}
                  <span className="block truncate text-[10px] text-ink/40">{m.unit || " "}</span>
                  <input
                    name={`value__${m.id}`}
                    inputMode="decimal"
                    placeholder="—"
                    className="mt-0.5 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink/40">後台「Lab 生物標記清單」尚未建立任何標記。</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton variant="outline" pendingText="儲存中…">
              儲存本次檢驗
            </SubmitButton>
            <span className="text-xs text-ink/40">沒驗到的項目留空即可（可 null），只有填了值的項目會被記錄。</span>
          </div>
        </form>
        <ul className="divide-y divide-brand-50">
          <CollapsedList listClassName="divide-y divide-brand-50" label="檢驗數據">
          {(labResults ?? []).map((r) => {
            const marker = Array.isArray(r.lab_marker_definitions) ? r.lab_marker_definitions[0] : r.lab_marker_definitions;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
                <span className="whitespace-nowrap font-medium text-ink/80">{marker?.display_name}</span>
                <span className="whitespace-nowrap text-ink/70">
                  {r.value !== null ? r.value : r.value_text}
                  {marker?.unit ? ` ${marker.unit}` : ""}
                </span>
                <span className="whitespace-nowrap text-xs text-ink/40">{r.sample_date}</span>
                {r.note && <span className="text-xs text-ink/40">・{r.note}</span>}
                <span className="whitespace-nowrap text-xs text-ink/20">・{r.recorded_by}</span>
                <form action={deleteLabResultAction} className="ml-auto">
                  <input type="hidden" name="case_id" value={id} />
                  <input type="hidden" name="result_id" value={r.id} />
                  <SubmitButton
                    variant="ghost"
                    size="sm"
                    className="!px-0 !py-0 text-xs text-red-400 underline hover:!bg-transparent"
                    pendingText="刪除中…"
                  >
                    刪除
                  </SubmitButton>
                </form>
              </li>
            );
          })}
          </CollapsedList>
          {(labResults ?? []).length === 0 && <li className="py-1.5 text-sm text-ink/40">尚無 Lab 數據</li>}
        </ul>
      </section>

      {/* 治療後追蹤結果（舊資料對齊欄位） */}
      <section id="section-outcome" data-nav-section data-nav-label="治療後追蹤結果" className="scroll-mt-4 rounded-lg border border-brand-100 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink/80">
          治療後追蹤結果
          <InfoTooltip text="記錄長期追蹤的復發狀態、復發日期、統計截止日等研究結果欄位，通常在統計截止時回頭填寫。" />
        </h2>
        <form action={updateOutcomeAction} className="grid grid-cols-2 gap-3 text-sm">
          <input type="hidden" name="case_id" value={id} />
          <div>
            <label className="block text-xs font-medium text-ink/70">是否復發</label>
            <select
              name="recurrence_status"
              defaultValue={caseRow.recurrence_status ?? ""}
              className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            >
              <option value="">未填</option>
              <option value="none">無復發</option>
              <option value="recurred">已復發</option>
              <option value="unknown">未知</option>
              <option value="not_applicable">不適用</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70">復發日期</label>
            <input
              type="date"
              name="recurrence_date"
              defaultValue={caseRow.recurrence_date ?? ""}
              className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70">治療後復發天數</label>
            <input
              type="number"
              name="days_to_recurrence"
              defaultValue={caseRow.days_to_recurrence ?? ""}
              className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70">統計截止日</label>
            <input
              type="date"
              name="followup_cutoff_date"
              defaultValue={caseRow.followup_cutoff_date ?? ""}
              className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-xs text-ink/70">
            <input type="checkbox" name="over_one_year_flag" defaultChecked={caseRow.over_one_year_flag === true} />
            距離治療後超過1年
          </label>
          <SubmitButton className="col-span-2" pendingText="更新中…">
            更新追蹤結果
          </SubmitButton>
        </form>
      </section>

      {/* 問卷填寫 */}
      <section id="section-responses" data-nav-section data-nav-label="問卷填寫" className="scroll-mt-4 rounded-lg border border-brand-100 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink/80">
            問卷填寫
            <InfoTooltip text="上半部是這個個案該填的問卷清單（哪些問卷正式上線需填寫，於後台「問卷產生器」勾選），已填的會打勾；下半部是歷次送出的回覆與計分。點問卷名稱即可填寫，不需等到排定的追蹤時間點。" />
          </h2>
          <Link
            href={`/patient/${id}/questionnaire`}
            className="whitespace-nowrap rounded-md bg-brand-700 px-3 py-1.5 text-xs text-white hover:bg-brand-800"
          >
            填寫其他問卷
          </Link>
        </div>

        <div className="mb-4 rounded-md border border-brand-100 bg-paper-raised p-3">
          <h3 className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink/60">
            應填問卷清單
            <span className="font-data font-normal text-ink/40">
              已完成 {requiredQuestionnaires.filter((q) => q.done).length}/{requiredQuestionnaires.length}
            </span>
          </h3>
          <ul className="space-y-1">
            {requiredQuestionnaires.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm">
                <Link href={`/patient/${id}/questionnaire?questionnaire_id=${q.id}`} className="text-brand-800 hover:underline">
                  {q.name}
                </Link>
                {q.done ? (
                  <>
                    <span className="whitespace-nowrap rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                      ✓ 已完成
                    </span>
                    <span className="whitespace-nowrap text-xs text-ink/40">
                      {new Date(q.done.latest).toLocaleDateString("zh-TW")}
                      {q.done.count > 1 && ` ・共 ${q.done.count} 次`}
                    </span>
                  </>
                ) : (
                  <span className="whitespace-nowrap rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">未完成</span>
                )}
              </li>
            ))}
            {requiredQuestionnaires.length === 0 && (
              <li className="text-xs text-ink/40">
                後台尚未指定任何「正式上線需填寫」的問卷（至「問卷產生器」勾選）。
              </li>
            )}
          </ul>
        </div>

        <h3 className="mb-1.5 text-xs font-semibold text-ink/60">歷次回覆紀錄</h3>
        <ul className="space-y-2">
          <CollapsedList listClassName="space-y-2" label="回覆紀錄">
          {(responses ?? []).map((r) => {
            const q = Array.isArray(r.questionnaire_templates) ? r.questionnaire_templates[0] : r.questionnaire_templates;
            const answers = extractAnswers(r);
            const isSF36 = q?.name === "SF-36 健康調查簡表";
            const isPSQI = q?.name === "匹茲堡睡眠品質量表（PSQI）";
            const isJSSClassification = q?.name === "JSS 疤痕診斷分類表";
            return (
              <li key={r.id} className="rounded-md border border-brand-50 p-2 text-sm text-ink/70">
                <div>
                  {new Date(r.submitted_at).toLocaleString("zh-TW")} ・ {q?.name} ・ 填寫人：
                  {r.submitted_via === "line_sim" ? "舊LINE路徑（已停用）" : "診間人員"}
                </div>
                {isSF36 && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {computeSF36(answers).scales.map((s) => (
                      <span key={s.key} className="whitespace-nowrap rounded bg-sky-50 px-2 py-0.5 text-xs text-sky-700">
                        {s.label}：{s.score ?? "—"}
                        {s.answeredCount < s.totalItems && <span className="text-sky-400">（{s.answeredCount}/{s.totalItems}題）</span>}
                      </span>
                    ))}
                  </div>
                )}
                {isPSQI &&
                  (() => {
                    const psqi = computePSQI(answers);
                    return (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {psqi.components.map((c) => (
                          <span key={c.key} className="whitespace-nowrap rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                            {c.label}：{c.score ?? "—"}
                          </span>
                        ))}
                        <span
                          className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${
                            psqi.global === null
                              ? "bg-ink/10 text-ink/40"
                              : psqi.poorSleep
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          總分：{psqi.global ?? "資料不足"}
                          {psqi.global !== null && `（${psqi.poorSleep ? "睡眠品質不佳" : "睡眠品質尚可"}）`}
                        </span>
                      </div>
                    );
                  })()}
                {isJSSClassification &&
                  (() => {
                    const result = computeJSSClassification(answers);
                    // 同一份量表重複施測，第二次以後會附上跟初次總分相比的 Delta Score
                    const delta = jssDeltaById.get(r.id);
                    return (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {result ? (
                          <span className="whitespace-nowrap rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                            JSS 總分 {result.total} / 25
                          </span>
                        ) : (
                          <span className="text-xs text-ink/40">資料不足，無法計分</span>
                        )}
                        {delta !== undefined && (
                          <span
                            className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                              delta > 0
                                ? "bg-emerald-100 text-emerald-700"
                                : delta < 0
                                ? "bg-red-100 text-red-700"
                                : "bg-ink/10 text-ink/50"
                            }`}
                          >
                            Delta Score：{delta > 0 ? `+${delta}` : delta}（較初次{delta > 0 ? "改善" : delta < 0 ? "惡化" : "持平"}）
                          </span>
                        )}
                      </div>
                    );
                  })()}

                {/* 逐題作答明細（docx 項次 9，2026-08-12）：先前只看得到計分結果，
                    看不到病患實際點了哪個選項。預設收合，需要時展開。 */}
                {(() => {
                  const rows = answerRows(r);
                  if (rows.length === 0) return null;
                  return (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-xs text-brand-700 hover:underline">
                        查看逐題作答（{rows.length} 題）
                      </summary>
                      <ol className="mt-1 space-y-0.5 border-l-2 border-brand-100 pl-3">
                        {rows.map((row) => (
                          <li key={row.orderNo} className="break-words text-xs text-ink/60">
                            <span className="text-ink/40">{row.orderNo}.</span> {row.text}
                            <span className="ml-1 font-medium text-ink/80">
                              → {row.answer || <span className="font-normal text-ink/30">（未作答）</span>}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  );
                })()}
              </li>
            );
          })}
          </CollapsedList>
          {(!responses || responses.length === 0) && <li className="text-sm text-ink/40">尚無問卷回覆</li>}
        </ul>
      </section>

      {/* 追蹤時程 */}
      <section id="section-schedule" data-nav-section data-nav-label="追蹤時程" className="scroll-mt-4 rounded-lg border border-brand-100 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink/80">
          追蹤時程
          <InfoTooltip text="套用範本後自動產生的追蹤項目，日期是「建檔日＋範本天數」的預估值。實際約診日確定後請改成正確日期——LINE 回診提醒是依這個日期推播的（提前 3 天與當天各一則）。" />
        </h2>

        {/* 臨時回診：實務上追蹤很難完全照範本走（例：「兩週後回來看傷口」） */}
        <details className="mb-3 rounded-md border border-brand-100 bg-paper-sunken p-2">
          <summary className="cursor-pointer text-xs text-brand-800">＋ 新增一次回診（範本以外）</summary>
          <form action={addScheduleItemAction} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="case_id" value={id} />
            <div>
              <label className="block text-xs text-ink/50">名稱</label>
              <input
                name="label"
                placeholder="例：拆線回診"
                className="mt-0.5 w-36 rounded-md border border-brand-200 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-ink/50">回診日期</label>
              <input type="date" name="due_date" required className="mt-0.5 rounded-md border border-brand-200 px-2 py-1 text-sm" />
            </div>
            <label className="flex items-center gap-1 text-xs text-ink/60">
              <input type="checkbox" name="remind" defaultChecked /> LINE 提醒
            </label>
            <SubmitButton variant="outline" size="sm" pendingText="新增中…">
              新增
            </SubmitButton>
          </form>
        </details>
        <ul className="space-y-2">
          {(scheduleItems ?? []).map((item) => (
            <li key={item.id} className="rounded-md border border-brand-100 bg-paper-raised px-3 py-2 text-sm">
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 break-words">
                  <span className="font-medium text-ink">{item.label}</span>
                  <span className="text-ink/40">到期 {item.due_date}</span>
                  <span className="text-xs text-ink/40">{(item.actions ?? []).join("、")}</span>
                  {item.questionnaire_id && (
                    <span className="text-xs text-ink/40">
                      問卷：
                      {(questionnaireTemplates ?? []).find((t) => t.id === item.questionnaire_id)?.name ?? "（已刪除）"}
                    </span>
                  )}
                  <span
                    className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                      item.status === "done"
                        ? "bg-emerald-100 text-emerald-700"
                        : item.status === "skipped"
                        ? "bg-ink/10 text-ink/50"
                        : "bg-accent-100 text-accent-800"
                    }`}
                  >
                    {item.status === "done" ? "已完成" : item.status === "skipped" ? "已跳過" : "待處理"}
                  </span>
                </div>

                {/* 改期：範本算出來的日期只是預估，實際約診日確定後改這裡，提醒才會在對的日子送出 */}
                {item.status === "pending" && (
                  <form action={updateScheduleItemDateAction} className="flex flex-wrap items-center gap-2 text-xs">
                    <input type="hidden" name="case_id" value={id} />
                    <input type="hidden" name="item_id" value={item.id} />
                    <span className="text-ink/40">實際回診日</span>
                    <input
                      type="date"
                      name="due_date"
                      defaultValue={item.due_date ?? ""}
                      className="rounded border border-brand-200 px-1.5 py-0.5 text-xs"
                    />
                    <label className="flex items-center gap-1 text-ink/60">
                      <input
                        type="checkbox"
                        name="remind"
                        defaultChecked={(item.actions ?? []).includes("visit_reminder")}
                      />
                      LINE 提醒
                    </label>
                    <SubmitButton variant="ghost" size="sm" className="!px-1 !py-0 text-xs underline" pendingText="儲存中…">
                      儲存日期
                    </SubmitButton>
                  </form>
                )}
                {item.status === "pending" && (
                  <div className="-mx-3 overflow-x-auto px-3">
                    <span className="flex w-max items-center gap-3 whitespace-nowrap">
                      {(item.actions ?? []).includes("questionnaire") &&
                        (item.questionnaire_id ? (
                          <Link
                            href={`/patient/${id}/questionnaire/${item.id}`}
                            className="text-xs text-brand-700 underline"
                          >
                            填寫問卷
                          </Link>
                        ) : (
                          <span className="text-xs text-red-400" title="此時間點標記了填問卷動作，但尚未指定問卷，請至後台時程範本補設定">
                            （未指定問卷）
                          </span>
                        ))}
                      {(item.actions ?? []).includes("photo") && (
                        <Link href={`/patient/${id}/photo/${item.id}`} className="text-xs text-brand-700 underline">
                          部位標記與拍照
                        </Link>
                      )}
                      <form action={markScheduleItemAction}>
                        <input type="hidden" name="case_id" value={id} />
                        <input type="hidden" name="item_id" value={item.id} />
                        <input type="hidden" name="status" value="done" />
                        <SubmitButton variant="ghost" size="sm" className="!px-1.5 !py-0.5 underline" pendingText="處理中…">
                          標記完成
                        </SubmitButton>
                      </form>
                    </span>
                  </div>
                )}
                {/* 個案層級改換問卷：只影響這一筆時程項目，不動後台範本、也不影響其他個案 */}
                {item.status === "pending" && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-ink/40 hover:text-ink/60">
                      {item.questionnaire_id ? "更換此時間點的問卷" : "指定此時間點的問卷"}
                    </summary>
                    <form
                      action={updateScheduleItemQuestionnaireAction}
                      className="mt-1.5 flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="case_id" value={id} />
                      <input type="hidden" name="item_id" value={item.id} />
                      <select
                        name="questionnaire_id"
                        defaultValue={item.questionnaire_id ?? ""}
                        className="rounded border border-brand-200 px-2 py-1 text-xs"
                      >
                        <option value="">（不指定問卷）</option>
                        {(questionnaireTemplates ?? []).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <SubmitButton variant="outline" size="sm" className="!px-2 !py-0.5 !text-xs" pendingText="儲存中…">
                        儲存
                      </SubmitButton>
                    </form>
                  </details>
                )}
              </div>
            </li>
          ))}
          {(!scheduleItems || scheduleItems.length === 0) && <li className="text-sm text-ink/40">尚未套用時程範本</li>}
        </ul>
      </section>

    </div>
  );
}
