import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { BIOBANK_ITEMS, isOutOfWindow } from "@/lib/biobank";
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
import ScheduleVisitForm from "./ScheduleVisitForm";
import MarkScheduleDoneButton from "./MarkScheduleDoneButton";
import PriorTreatmentPicker from "./PriorTreatmentPicker";
import MultiEntryInput from "./MultiEntryInput";
import KeloidLesionSection from "./KeloidLesionSection";
import InfoTooltip from "@/components/InfoTooltip";
import PatientName, { PatientMrn } from "@/components/LocalNameProvider";
import SubmitButton from "@/components/ui/SubmitButton";
import CollapsedList from "@/components/ui/CollapsedList";
import type { CasePipelineRow } from "@/lib/pipeline";
import { DOSE_CATEGORY_LABEL } from "@/lib/bodyZones";
import { PATIENT_INTAKE_SEGMENTS } from "@/lib/patientIntake";
import { onsetDateToMonth } from "@/lib/onsetMonth";
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

/**
 * 待補項目 → 對應輸入欄位的錨點（2026-08-20）。
 *
 * 跟上面的 COMPLETENESS_ANCHOR 只指到「區塊」不同，這裡指到**那一格**：
 * 待補清單是給人員照著補的工作清單，捲到一個有八個欄位的表單然後自己找，
 * 等於清單只做了一半。欄位的 id 與 `target:` 高亮在下面各欄位上。
 *
 * 病灶的免除註記（lesion_measure_<id>／lesion_photo_<id>）不在這張表裡——
 * 它們的錨點是那個病灶自己的列，見 followupAnchor()。
 */
const FOLLOWUP_ANCHOR: Record<string, string | undefined> = {
  sex: "field-sex",
  age: "field-birth_date",
  height: "field-height_cm",
  weight: "field-weight_kg",
  phone: "field-phone_number",
  family_history: "field-family_history",
  keloid_onset_date: "field-keloid_onset_date",
  prior_treatment_physician: "field-prior_treatment_physician",
  prior_steroid_treatment: "field-prior_steroid_treatment",
  prior_tcm_treatment: "field-prior_tcm_treatment",
  prior_ogawa_patch: "field-prior_ogawa_patch",
  prior_radiation_treatment: "field-prior_radiation_treatment",
  // 選單類（2026-08-24 起跳過／答不知道也會留一筆待補）。field_key 就是 category。
  visit_reason: "field-intake-visit_reason",
  onset_cause: "field-intake-onset_cause",
  referral_source: "field-intake-referral_source",
  keloid_symptom: "field-intake-keloid_symptom",
  // 病人自評量表漏答：一份一筆，點過去是問卷區塊（要重填整份，不是補某一格）
  questionnaire_sf36: "section-responses",
  questionnaire_psqi: "section-responses",
};

/** 從待補清單點過來時，`:target` 讓那一格亮一圈——捲到位還要自己找是哪一格就白做了。 */
const FIELD_ANCHOR = "scroll-mt-24 rounded-md target:bg-accent-50 target:ring-2 target:ring-accent-400";

function followupAnchor(fieldKey: string): string | undefined {
  const m = fieldKey.match(/^lesion_(?:measure|photo)_(.+)$/);
  if (m) return `lesion-${m[1]}`;
  return FOLLOWUP_ANCHOR[fieldKey];
}


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
  // 診間當下做不到而免除（例如量不到、病人拒絕拍照），見 /cases/[id]/clinic-flow
  waived: "診間免除",
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
        // completed_at：null ＝ 病人版存到一半被中斷的草稿（2026-08-26）。
        // 這裡刻意**不過濾掉**——個案頁正是人員要看到「這份還沒填完，去接續」的地方；
        // 濾掉的是計分、應填清單與匯出。
        // schedule_item_id：追蹤時程那一列要標出「這個時間點的問卷填了沒」（2026-08-26）
        "id, submitted_at, submitted_via, completed_at, schedule_item_id, questionnaire_templates(id, name), questionnaire_answers(answer_value, updated_at, updated_by, questionnaire_questions(order_no, question_text, question_type, options))"
      )
      .eq("case_id", id)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("photos")
      // schedule_item_id：追蹤時程那一列要標出「這個時間點拍了沒」（2026-08-26）
      .select("id, taken_at, body_site, lesion_id, file_path, thumbnail_path, schedule_item_id, source")
      .eq("case_id", id)
      .order("taken_at", { ascending: false }),
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
      // option_id 是給表單帶入「目前值」用的（2026-08-24）：勾選框原本永遠空白，
      // 病人在平板上選過的答案只出現在下面那行灰字歷次紀錄，看起來像是整題沒填到。
      .select("id, category, recorded_at, recorded_by, notes, case_intake_option_record_items(option_id, case_intake_option_lists(label))")
      .eq("case_id", id)
      .order("recorded_at", { ascending: false }),
    supabase.from("lab_marker_definitions").select("id, display_name, unit").eq("active", true).order("sort_order"),
    supabase
      .from("lab_results")
      // marker_id：紀錄要攤成「一列一個採檢日期、每個標記固定一欄」的寬表，得靠它對欄（2026-08-27）
      .select("id, marker_id, sample_date, value, value_text, note, recorded_by, lab_marker_definitions(display_name, unit)")
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

  /**
   * 每一類選單的「目前值」＝最新一筆紀錄勾了哪些（intakeRecords 已依 recorded_at 由新到舊排序）。
   *
   * 這幾類是逐筆累加的歷史（append-only），所以最新一筆就是現況，而修改現況＝再存一筆新的。
   * 2026-08-24 之前表單一律空白，於是病人自填的答案在個案頁上看起來像沒填。
   */
  function latestOptionRecord(category: string) {
    const latest = (intakeRecords ?? []).find((r) => r.category === category);
    if (!latest) return { recordId: null as string | null, optionIds: [] as string[] };
    return {
      recordId: latest.id as string,
      optionIds: (latest.case_intake_option_record_items ?? [])
        .map((it: { option_id?: string | null }) => it.option_id)
        .filter((v): v is string => Boolean(v)),
    };
  }

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
      /** 這一題後來被改過的時間（2026-08-25）；null＝首次送出後沒動過 */
      updated_at?: string | null;
      updated_by?: string | null;
      questionnaire_questions:
        | { order_no?: number; question_text?: string; question_type?: string; options?: unknown }
        | { order_no?: number; question_text?: string; question_type?: string; options?: unknown }[]
        | null;
    }[];
  }) {
    const rows: { orderNo: number; text: string; answer: string; updatedAt?: string | null; updatedBy?: string | null }[] = [];
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
      rows.push({
        orderNo: q.order_no,
        text: q.question_text ?? "",
        answer,
        updatedAt: a.updated_at ?? null,
        updatedBy: a.updated_by ?? null,
      });
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
    // 草稿不算已完成（2026-08-26）——不然「應填問卷清單」會對一份只答了 19/36 題的
    // SF-36 打綠色的勾，那正是這次要修掉的假完成。
    if (!r.completed_at) continue;
    const prev = responseCountByTemplate.get(q.id);
    responseCountByTemplate.set(q.id, {
      count: (prev?.count ?? 0) + 1,
      latest: prev && prev.latest > r.submitted_at ? prev.latest : r.submitted_at,
    });
  }
  const requiredQuestionnaires = (questionnaireTemplates ?? [])
    .filter((t) => t.required_for_intake)
    .map((t) => ({ ...t, done: responseCountByTemplate.get(t.id) }));

  // ── 治療紀錄拆成術前／術後兩區（2026-08-26 助理要求）────────────────
  //
  // 在這之前，「手術前的治療」「收案當次手術」「之後每一次回診的治療」全部擠在同一張表、
  // 同一份清單裡，看不出一位病人的治療歷程走到哪。現在依日期分流：
  //   ≤ 手術日 → 上方「術前治療與收案當次手術」
  //   > 手術日 → 下方追蹤時程那一區（跟每一次回診的時間點放在一起）
  //
  // **資料完全不動**（treatment_records 沒有新欄位）：手術日本來就推導得出來，
  // 多一個可能跟日期矛盾的分類欄位只會多一個要維護的東西。
  // 尚未登記手術的個案，全部算術前——他還沒開刀，本來就沒有「術後回診」。
  const treatmentTypeNameOf = (r: { treatment_types: unknown }) => {
    const tt = Array.isArray(r.treatment_types) ? r.treatment_types[0] : r.treatment_types;
    return (tt as { name?: string } | null)?.name ?? "";
  };
  const surgeryDate =
    (treatmentRecords ?? [])
      .filter((r) => treatmentTypeNameOf(r) === "手術切除")
      .map((r) => r.treatment_date)
      .sort()[0] ?? null;
  const isFollowUpRecord = (r: { treatment_date: string }) => surgeryDate !== null && r.treatment_date > surgeryDate;
  const preOpRecords = (treatmentRecords ?? []).filter((r) => !isFollowUpRecord(r));
  const followUpRecords = (treatmentRecords ?? []).filter(isFollowUpRecord);

  // 台北時區的今天。時程列的「實際回診日」預帶這一天。
  const todayTaipei = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date());

  // 治療紀錄現在有三個地方要列（術前那一區、時程列底下、其他回診治療），
  // 攤平的方式共用同一份，免得三處各寫一次而漸漸長歪。
  type TreatmentRowSource = (NonNullable<typeof treatmentRecords>)[number];
  const toTreatmentRow = (r: TreatmentRowSource) => {
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
  };
  const symptomChangeOptions = (intakeOptions ?? [])
    .filter((o) => o.category === "symptom_change")
    .map((o) => ({ id: o.id, label: o.label }));
  const treatmentFieldSchemas = Object.fromEntries((treatmentTypes ?? []).map((t) => [t.id, t.field_schema ?? []]));

  // 每一列時程的狀態：那天登了哪些治療、問卷填了沒、拍了沒。
  // 治療用「日期對得上」關聯——登記時會把 due_date 寫成實際回診日，所以對得起來；
  // 對不上任何一列的（臨時回診、舊資料匯入）落到「其他回診治療」那一區，不會不見。
  const scheduleDueDates = new Set((scheduleItems ?? []).map((s) => s.due_date));
  const treatmentsByDate = new Map<string, typeof followUpRecords>();
  for (const r of followUpRecords) {
    treatmentsByDate.set(r.treatment_date, [...(treatmentsByDate.get(r.treatment_date) ?? []), r]);
  }
  const orphanFollowUpRecords = followUpRecords.filter((r) => !scheduleDueDates.has(r.treatment_date));
  const responseByScheduleItem = new Set(
    (responses ?? []).filter((r) => r.schedule_item_id && r.completed_at).map((r) => r.schedule_item_id as string)
  );
  const photoByScheduleItem = new Set(
    (photos ?? []).filter((p) => p.schedule_item_id).map((p) => p.schedule_item_id as string)
  );
  /**
   * 這一列還有什麼沒做（2026-08-26）。標記完成／登記回診前會拿它跳一次確認——
   * 「已完成但問卷其實沒填」正是文件抱怨的來源。
   * 只看該列**指定的動作**：沒掛問卷動作的列不會因為沒問卷而被嘮叨。
   */
  const pendingWarningsFor = (item: { id: string; actions: string[] | null; questionnaire_id: string | null }): string[] => {
    const out: string[] = [];
    const acts = item.actions ?? [];
    if (acts.includes("questionnaire") && item.questionnaire_id && !responseByScheduleItem.has(item.id)) {
      const name = (questionnaireTemplates ?? []).find((t) => t.id === item.questionnaire_id)?.name ?? "問卷";
      out.push(`問卷（${name}）`);
    }
    if (acts.includes("photo") && !photoByScheduleItem.has(item.id)) out.push("拍照");
    return out;
  };

  // ── Lab 生物標記：紀錄攤成寬表（2026-08-27 使用者要求）──────────────
  //
  // 輸入表單本來就是「一次橫向填完所有標記」，但下方的紀錄清單是逐筆列的：
  // 一次採檢只驗了 9 項裡的 2 項，就只長出 2 行，而且不同採檢日期之間左右對不齊，
  // 沒辦法一眼看出某個標記在各次採檢的變化。
  //
  // 改成一列＝一個採檢日期，每個標記固定一欄，沒驗的那幾格明寫「未輸入」——
  // 留白會讓人分不清是沒驗還是漏看。
  //
  // 欄位＝後台目前啟用的標記，再補上「已停用但這位病人驗過」的（附在後面並標示），
  // 否則停用一個標記就會讓歷史數據從畫面上消失。
  type LabColumn = { id: string; name: string; unit: string | null; retired: boolean };
  const labColumns: LabColumn[] = (() => {
    const cols: LabColumn[] = (labMarkers ?? []).map((m) => ({
      id: m.id,
      name: m.display_name,
      unit: m.unit,
      retired: false,
    }));
    const known = new Set(cols.map((c) => c.id));
    for (const r of labResults ?? []) {
      if (!r.marker_id || known.has(r.marker_id)) continue;
      known.add(r.marker_id);
      const def = Array.isArray(r.lab_marker_definitions) ? r.lab_marker_definitions[0] : r.lab_marker_definitions;
      cols.push({ id: r.marker_id, name: def?.display_name ?? "（已刪除的標記）", unit: def?.unit ?? null, retired: true });
    }
    return cols;
  })();
  // 同一次採檢的同一個標記理論上只有一筆，但沒有唯一鍵擋著（重複登打就會有兩筆）。
  // 存成陣列並在畫面上全部列出來，而不是默默只顯示其中一筆——看不到的資料比看得到的錯誤更難查。
  type LabResultRow = (NonNullable<typeof labResults>)[number];
  const labRows = (() => {
    const byDate = new Map<string, Map<string, LabResultRow[]>>();
    for (const r of labResults ?? []) {
      if (!byDate.has(r.sample_date)) byDate.set(r.sample_date, new Map());
      const row = byDate.get(r.sample_date)!;
      row.set(r.marker_id, [...(row.get(r.marker_id) ?? []), r]);
    }
    // labResults 已是採檢日期新到舊，這裡再排一次是因為 Map 的順序取決於插入順序
    return [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([sampleDate, byMarker]) => ({ sampleDate, byMarker }));
  })();
  const labCellText = (rows: LabResultRow[] | undefined) =>
    rows && rows.length > 0 ? rows.map((r) => (r.value !== null ? String(r.value) : r.value_text ?? "")).join(" / ") : null;

  // ── 追蹤時程分三組（2026-08-26 建立，08-27 依使用者回報再收窄）──────────
  //
  // 一位病人有 27 筆時程（術後 24 個月的每月追蹤＋3 次抽血），整面攤開就是一面牆。
  //
  // 08-26 的第一版把「已逾期」也算進預設展開，理由是逾期的最該被看到。實際上反了：
  // 一位拖了一年沒回診的病人有二十幾筆逾期，全部展開之後那面牆更長，而且逾期這件事
  // 本來一行字就講得完。所以改成三組：
  //
  //   ① 近期待處理（今天 ~ 今天＋3 個月）→ 展開。這是真正要動手處理的
  //   ② 已逾期                          → 收折，但摘要行用醒目色寫出筆數與最早那筆的日期
  //   ③ 其他（已完成、免回診、三個月後才到期）→ 收折
  //
  // 逾期收折但**筆數一定看得到**——收折的目的是不佔版面，不是把它藏起來。
  //
  // 放療不在這份清單裡（它是 radiotherapy_sessions，上方獨立區塊），刻意不合併：
  // 放療要填實際劑量與放射科醫師，那些欄位搬不進時程列，合併只會讓同一件事出現在兩個地方。
  const scheduleHorizon = (() => {
    // 從台北的今天往後推三個月。用 todayTaipei 當起點而不是 new Date()——
    // 伺服器跑 UTC，直接拿 UTC 的今天推會在台北時間的凌晨差一天。
    const d = new Date(`${todayTaipei}T00:00:00+08:00`);
    d.setMonth(d.getMonth() + 3);
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(d);
  })();
  const isPendingItem = (item: { status: string }) => item.status === "pending";
  const overdueScheduleItems = (scheduleItems ?? []).filter((s) => isPendingItem(s) && s.due_date < todayTaipei);
  const upcomingScheduleItems = (scheduleItems ?? []).filter(
    (s) => isPendingItem(s) && s.due_date >= todayTaipei && s.due_date <= scheduleHorizon
  );
  const collapsedScheduleItems = (scheduleItems ?? []).filter(
    (s) => !overdueScheduleItems.includes(s) && !upcomingScheduleItems.includes(s)
  );
  // scheduleItems 是依 due_date 遞增查出來的，所以第一筆就是最早的那筆逾期
  const earliestOverdue = overdueScheduleItems[0]?.due_date ?? null;

  /** 時程列的內容。展開區與收折區共用同一份，兩邊各寫一次遲早會長歪。 */
  const renderScheduleRow = (item: (NonNullable<typeof scheduleItems>)[number]) => {
    // 這一列還缺什麼（問卷／拍照），以及那一天已經登了哪些治療。
    // 「已完成但問卷其實沒填」就是靠 pending 這一串標出來的（2026-08-26）。
    const pending = pendingWarningsFor(item);
    const dayTreatments = treatmentsByDate.get(item.due_date) ?? [];
    return (
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
            {item.status === "done" ? "已完成" : item.status === "skipped" ? "本月免回診" : "待處理"}
          </span>
          {/* 不分狀態都標出來。已完成的列更要標——那正是「看起來做完了，其實沒有」的情況 */}
          {pending.length > 0 && item.status !== "skipped" && (
            <span className="whitespace-nowrap rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
              ⚠ {pending.join("、")}尚未完成
            </span>
          )}
        </div>

        {/* 那一天登到的治療：把回診治療放在該次回診的時間點旁邊（2026-08-26） */}
        {dayTreatments.length > 0 && (
          <ul className="space-y-0.5 border-l-2 border-brand-100 pl-2.5">
            {dayTreatments.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-1.5 text-xs text-ink/60">
                <span className="text-ink/80">{treatmentTypeNameOf(r) || "（未指定治療方式）"}</span>
                {r.body_site && <span className="rounded bg-brand-50 px-1.5 text-ink/50">{r.body_site}</span>}
                {r.recurrence_observed && <span className="text-red-600">復發</span>}
                {r.blood_drawn && <span className="text-sky-700">抽血</span>}
                {r.symptom_change_option_id && (
                  <span className="text-emerald-700">
                    {symptomChangeOptions.find((o) => o.id === r.symptom_change_option_id)?.label ?? ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {item.status === "skipped" && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink/40">
            <span>{item.skipped_reason ?? "醫師判定免回診"}</span>
            <form action={markScheduleItemAction}>
              <input type="hidden" name="case_id" value={id} />
              <input type="hidden" name="item_id" value={item.id} />
              <input type="hidden" name="status" value="pending" />
              <SubmitButton variant="ghost" size="sm" className="!px-1 !py-0 text-xs underline" pendingText="處理中…">
                改回待處理
              </SubmitButton>
            </form>
          </div>
        )}

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
        {/* 填問卷／拍照的連結**不分狀態都顯示**（2026-08-26）。
            原本只在 pending 時渲染，於是那一列一被標成完成，補填的入口就整個消失——
            文件抱怨的「已完成但問卷未完成，無法再打開補填」有一半是這裡造成的。 */}
        {item.status !== "skipped" && (
          <div className="-mx-3 overflow-x-auto px-3">
            <span className="flex w-max items-center gap-3 whitespace-nowrap">
              {(item.actions ?? []).includes("questionnaire") &&
                (item.questionnaire_id ? (
                  <Link
                    href={`/patient/${id}/questionnaire/${item.id}`}
                    className="text-xs text-brand-700 underline"
                  >
                    {responseByScheduleItem.has(item.id) ? "問卷已填，點此重填" : "填寫問卷"}
                  </Link>
                ) : (
                  <span className="text-xs text-red-400" title="此時間點標記了填問卷動作，但尚未指定問卷，請至後台時程範本補設定">
                    （未指定問卷）
                  </span>
                ))}
              {(item.actions ?? []).includes("photo") && (
                <Link href={`/patient/${id}/photo/${item.id}`} className="text-xs text-brand-700 underline">
                  {photoByScheduleItem.has(item.id) ? "已拍照，點此再拍" : "部位標記與拍照"}
                </Link>
              )}
              {item.status === "pending" ? (
                <>
                  {/* 有未完成事項時會先跳確認，沒有的話跟以前一樣一按就完成 */}
                  <MarkScheduleDoneButton caseId={id} itemId={item.id} pendingWarnings={pending} />
                  {/* 醫師判定穩定、改為每 2 個月追蹤時，跳過的月份標這個而不是刪掉：
                      欄位對齊 FW1–24 不變，也查得到是從第幾個月開始降頻的（決策 2026-08-20 F-D3） */}
                  <form action={markScheduleItemAction}>
                    <input type="hidden" name="case_id" value={id} />
                    <input type="hidden" name="item_id" value={item.id} />
                    <input type="hidden" name="status" value="skipped" />
                    <SubmitButton
                      variant="ghost"
                      size="sm"
                      className="!px-1.5 !py-0.5 text-ink/40 underline"
                      pendingText="處理中…"
                    >
                      本月免回診
                    </SubmitButton>
                  </form>
                </>
              ) : (
                // 已完成的回頭路（2026-08-26）。不加 PIN、不限身分——發現問卷沒填的
                // 就是當下那位護理師，要她先去切換操作者只會讓她乾脆不補。
                <form action={markScheduleItemAction}>
                  <input type="hidden" name="case_id" value={id} />
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="status" value="pending" />
                  <SubmitButton
                    variant="ghost"
                    size="sm"
                    className="!px-1.5 !py-0.5 text-ink/40 underline"
                    pendingText="處理中…"
                  >
                    改回待處理
                  </SubmitButton>
                </form>
              )}
            </span>
          </div>
        )}

        {/* 登記本次回診（2026-08-26）：治療紀錄跟該次回診的時間點放在一起 key。
            只有待處理的列才展得開——已完成的要先「改回待處理」，避免同一次回診被登兩筆。 */}
        {item.status === "pending" && (
          <details className="text-xs">
            <summary className="cursor-pointer font-medium text-brand-700 hover:text-brand-800">
              ＋ 登記本次回診（治療、症狀變化、復發、抽血）
            </summary>
            <ScheduleVisitForm
              caseId={id}
              itemId={item.id}
              today={todayTaipei}
              lesions={lesionList.map((l) => ({ id: l.id, site_no: l.site_no, body_site: l.body_site }))}
              symptomOptions={symptomChangeOptions}
              treatmentTypes={(treatmentTypes ?? []).map((t) => ({ id: t.id, name: t.name }))}
              pendingWarnings={pending}
            />
          </details>
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
    );
  };

  // JSS 疤痕診斷分類表（JSW Scar Scale 2015）：同一份量表每次追蹤重複施測，
  // 以個案最早一筆回覆的總分當基準，計算每筆回覆的 Delta Score（基準分-本次分，正值代表改善）。
  // （2026-07-27 決策：原本另有一份 6 題追蹤評估表，已刪除只留這份正式量表。）
  const jssDeltaById = new Map<string, number>();
  {
    const jssResponses = (responses ?? [])
      .filter((r) => {
        const q = Array.isArray(r.questionnaire_templates) ? r.questionnaire_templates[0] : r.questionnaire_templates;
        // 草稿不當基準也不算一次施測，否則 Delta 會拿半份問卷的總分當基準線
        return q?.name === "JSS 疤痕診斷分類表" && r.completed_at;
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
          {/* 病歷號（2026-08-29）：在這之前它從建檔之後就再也沒出現在畫面上——
              可以拿它搜尋，但搜到之後沒東西可以核對是不是同一個人，而醫院裡認人靠的正是它。 */}
          <PatientMrn mrn={caseRow.mrn} className="text-base text-ink/50" />
          <PatientName name={caseRow.patient_name} className="text-lg text-ink/70" />
          {/* 測試個案（2026-08-25）：正式與測試資料混在同一套系統裡，要在最顯眼的地方講清楚 */}
          {caseRow.is_test && (
            <span className="rounded bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">測試個案</span>
          )}
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
            <InfoTooltip text="把平板交給病人，依序填寫只有他自己知道答案的部分（性別／出生日期／身高體重／電話、病史、發生原因、SF-36、PSQI）。臨床評分（JSS，評主病灶）、病灶尺寸、拍照仍由診間人員操作。病人答「不知道」或答「有」但問不到細節的項目，會列在下方待補清單。" />
          </h2>
          <span className="flex flex-wrap gap-2">
            <Link
              href={`/patient/${id}/intake`}
              className="whitespace-nowrap rounded-md bg-brand-700 px-3 py-1.5 text-xs text-white hover:bg-brand-800"
            >
              {patientIntakeDone === 0 ? "交給病人填" : patientIntakeDone < PATIENT_INTAKE_SEGMENTS.length ? "繼續填" : "重新填寫"}
            </Link>
            {/* 收案／回診當次的完整動線都各自成頁，個案頁只留入口（決策 2026-08-20） */}
            <Link
              href={`/cases/${id}/clinic-flow`}
              className="whitespace-nowrap rounded-md border border-brand-200 px-3 py-1.5 text-xs text-brand-700 hover:bg-brand-50"
            >
              診間收案動線 →
            </Link>
            <Link
              href={`/cases/${id}/visit-flow`}
              className="whitespace-nowrap rounded-md border border-brand-200 px-3 py-1.5 text-xs text-brand-700 hover:bg-brand-50"
            >
              回診登記 →
            </Link>
          </span>
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
                    {/* 直接連到要補的那一格（2026-08-20）。待補清單是給人員照著補的工作清單，
                        只捲到一個有八個欄位的表單、剩下自己找，等於清單只做了一半。
                        已處理的就不再給連結——那是紀錄，不是待辦。 */}
                    {(() => {
                      const anchor = f.status === "resolved" ? undefined : followupAnchor(f.field_key);
                      return anchor ? (
                        <Link
                          href={`#${anchor}`}
                          className="font-medium text-brand-800 underline decoration-brand-300 underline-offset-2"
                        >
                          {f.field_label} ↓
                        </Link>
                      ) : (
                        <span className={f.status === "resolved" ? "text-ink/40 line-through" : "font-medium text-ink"}>
                          {f.field_label}
                        </span>
                      );
                    })()}
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
          <div id="field-sex" className={FIELD_ANCHOR}>
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
          <div id="field-birth_date" className={FIELD_ANCHOR}>
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
          <div id="field-height_cm" className={FIELD_ANCHOR}>
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
          <div id="field-weight_kg" className={FIELD_ANCHOR}>
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
          <div id="field-phone_number" className={FIELD_ANCHOR}>
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
          <div id="field-family_history" className={`col-span-2 ${FIELD_ANCHOR}`}>
            <label className="block text-xs font-medium text-ink/70">Family（家族史）</label>
            <FamilyHistoryPicker name="family_history" title="選擇家族病史" options={familyDiseaseOptions} defaultValue={caseRow.family_history ?? ""} />
          </div>
          <SubmitButton className="col-span-2" pendingText="更新中…">
            更新基本資料
          </SubmitButton>
        </form>

        <div id="section-lesions" className="mt-4 scroll-mt-4 border-t border-brand-50 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink/60">
              蟹足腫部位與大小
              <InfoTooltip text="按「建立部位」會開啟人形圖：點下部位就是相機，拍完照片自動建立該部位並帶入劑量分類。每個部位各自跑自己的放射治療排程（胸/肩胛區18Gy×3、耳8Gy×1、其他部位15Gy×2）。" />
            </span>
            {/* 2026-08-25：原本這顆叫「立即拍照」，旁邊另有一塊常駐的人形圖＋新增病灶表單。
                建立部位本來就會拍照，兩個入口只是讓人猶豫該用哪個，所以留這一條並改名。 */}
            <Link
              href={`/patient/${id}/photo`}
              className="whitespace-nowrap rounded-md bg-brand-700 px-3 py-1.5 text-xs text-white hover:bg-brand-800"
            >
              ＋ 建立部位（拍照）
            </Link>
          </div>
          <KeloidLesionSection
            caseId={id}
            lesions={lesionList}
            zones={bodyZones ?? []}
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
          <div id="field-keloid_onset_date" className={FIELD_ANCHOR}>
            <label className="block text-xs font-medium text-ink/70">蟹足腫初次發生時間（只到年月）</label>
            <input
              type="month"
              name="keloid_onset_date"
              defaultValue={onsetDateToMonth(caseRow.keloid_onset_date)}
              className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div id="field-prior_treatment_physician" className={FIELD_ANCHOR}>
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
          <PriorTreatmentPicker name="prior_steroid_treatment" label="之前類固醇注射治療" defaultValue={caseRow.prior_steroid_treatment ?? ""} anchorClassName={FIELD_ANCHOR} />
          <PriorTreatmentPicker name="prior_tcm_treatment" label="之前中醫治療" defaultValue={caseRow.prior_tcm_treatment ?? ""} anchorClassName={FIELD_ANCHOR} />
          <PriorTreatmentPicker name="prior_ogawa_patch" label="之前小川令貼布使用史" defaultValue={caseRow.prior_ogawa_patch ?? ""} anchorClassName={FIELD_ANCHOR} />
          <PriorTreatmentPicker name="prior_radiation_treatment" label="之前放射線治療史" defaultValue={caseRow.prior_radiation_treatment ?? ""} anchorClassName={FIELD_ANCHOR} />
          <SubmitButton className="col-span-2" pendingText="更新中…">
            更新病史與過往治療
          </SubmitButton>
        </form>
      </section>

      {/* 發生原因 / 得知看診資訊 / 飲食運動衛教（後台可維護選單，決策 2026-07-27） */}
      <section id="section-intake" data-nav-section data-nav-label="發生原因與看診來源" className="scroll-mt-4 rounded-lg border border-brand-100 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink/80">
          就診原因 / 發生原因 / 得知看診資訊 / 目前症狀
          <InfoTooltip text="四類選單皆為後台可維護清單（非單純勾選），可複選並保留歷次紀錄。勾選框會帶入最新一筆的內容（＝目前值），改完儲存會再存一筆新紀錄，歷次紀錄不會被蓋掉。「目前不適症狀」的『無明顯不適』與其他選項互斥。衛教內容不在此記錄，改由後台「衛教資料庫」維護供 LINE 衛教機器人參考。" />
          {/* 「此次就診主要原因」是病人自填 history 段的最後一題，其餘三類在 intake_options 段 */}
          <PatientFilledBadge entry={patientIntakeBySegment.get("intake_options")} />
        </h2>
        {INTAKE_CATEGORIES.map((cat) => {
          const options = (intakeOptions ?? []).filter((o) => o.category === cat.key);
          const records = (intakeRecords ?? []).filter((r) => r.category === cat.key);
          const current = latestOptionRecord(cat.key);
          return (
            // 待補清單點過來時落在這一區塊（field_key 就是 category，見 FOLLOWUP_ANCHOR）
            <div key={cat.key} id={`field-intake-${cat.key}`} className={`mb-4 last:mb-0 ${FIELD_ANCHOR}`}>
              <h3 className="mb-1 text-xs font-semibold text-ink/50">{cat.label}</h3>
              <IntakeOptionForm
                key={current.recordId ?? "empty"}
                caseId={id}
                category={cat.key}
                options={options}
                defaultOptionIds={current.optionIds}
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
      {/* 2026-08-26：這一區從「治療紀錄」縮成「術前治療與收案當次手術」。
          術後每一次回診的治療改到下方追蹤時程那一區，跟該次回診的時間點放在一起。
          id 維持 section-treatment——導覽與各處的欄位定位連結都指著它，改了會全斷。 */}
      <section id="section-treatment" data-nav-section data-nav-label="術前治療與收案當次手術" className="scroll-mt-4 rounded-lg border border-brand-100 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink/80">
          術前治療與收案當次手術
          <InfoTooltip text="收案手術（含）以前的治療都記在這裡：術前的病灶內注射、藥膏、貼片，以及收案當次的手術切除。選擇治療類型並填寫對應欄位；若有常用套組可直接選擇帶入數值，再視情況微調後儲存。登打「手術切除」且已標記部位時會自動產生放射治療排程，並以手術日為起點排出術後追蹤時程。術後每次回診的治療請到下方「追蹤時程」該次回診那一列登記。" />
        </h2>
        <p className="mb-2 text-xs text-ink/45">
          {surgeryDate
            ? `手術日 ${surgeryDate}（最早一筆「手術切除」）。這一區只顯示該日（含）以前的治療；之後的在下方追蹤時程。`
            : "尚未登記「手術切除」，所以目前所有治療紀錄都列在這一區。登記手術後，之後的治療會自動歸到下方追蹤時程。"}
        </p>
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
          records={preOpRecords.map(toTreatmentRow)}
          fieldSchemas={Object.fromEntries((treatmentTypes ?? []).map((t) => [t.id, t.field_schema ?? []]))}
          symptomChangeOptions={symptomChangeOptions}
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

      {/* 追蹤時程 */}
      <section id="section-schedule" data-nav-section data-nav-label="追蹤時程" className="scroll-mt-4 rounded-lg border border-brand-100 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink/80">
          追蹤時程（含每次回診的治療）
          <InfoTooltip text="套用範本後自動產生的追蹤項目，日期是「手術日＋範本天數」的預估值。病人實際來的那天，就在那一列展開「登記本次回診」：填實際回診日、勾本次治療，送出後會一併建立治療紀錄、把日期寫回這一列、並標記完成。LINE 回診提醒是依這個日期推播的（提前 3 天與當天各一則）。" />
        </h2>
        <p className="mb-2 text-xs text-ink/45">
          術後每一次回診的治療都記在這裡——展開該次回診那一列登記。
          劑量、套組等細節欄位這裡不收，登記後到上方「術前治療與收案當次手術」的表單補。
        </p>

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
          {/* ① 已逾期：收折，但摘要行永遠看得到筆數與最早那一筆的日期。
              用醒目色而不是一般的灰字連結——收折是為了不佔版面，不是把逾期藏起來。
              排在最上面：要先知道欠了幾筆，才知道這位病人的狀況。 */}
          {overdueScheduleItems.length > 0 && (
            <li>
              <details className="group rounded-md border-2 border-amber-300 bg-amber-50 px-3 py-2">
                <summary className="cursor-pointer list-none text-sm font-medium text-amber-900">
                  <span className="group-open:hidden">
                    ⚠ 還有 {overdueScheduleItems.length} 筆已逾期{earliestOverdue && `（最早 ${earliestOverdue}）`} ▾
                  </span>
                  <span className="hidden group-open:inline">▴ 收合這 {overdueScheduleItems.length} 筆逾期</span>
                </summary>
                <ul className="mt-2 space-y-2">{overdueScheduleItems.map(renderScheduleRow)}</ul>
              </details>
            </li>
          )}

          {/* ② 近期待處理（今天 ~ 三個月內）：這是真正要動手的，直接展開 */}
          {upcomingScheduleItems.map(renderScheduleRow)}
          {/* 沒有近期待辦時要講一句，不然畫面上只剩收折鈕，看起來像這位病人沒有時程 */}
          {upcomingScheduleItems.length === 0 && (scheduleItems ?? []).length > 0 && (
            <li className="text-sm text-ink/40">近三個月內沒有待處理的時程。</li>
          )}

          {/* ③ 其他：已完成、免回診，以及三個月後才到期的 */}
          {collapsedScheduleItems.length > 0 && (
            <li className="pt-1">
              {/* 用 <details> 而不是 useState——這一整段還是 server component */}
              <details className="group">
                <summary className="cursor-pointer list-none text-xs text-brand-700 underline decoration-dotted underline-offset-2 hover:text-brand-900">
                  <span className="group-open:hidden">▾ 顯示其餘 {collapsedScheduleItems.length} 筆（已完成、免回診，以及三個月後才到期的）</span>
                  <span className="hidden group-open:inline">▴ 收合其餘時程</span>
                </summary>
                <ul className="mt-2 space-y-2">{collapsedScheduleItems.map(renderScheduleRow)}</ul>
              </details>
            </li>
          )}
          {(!scheduleItems || scheduleItems.length === 0) && (
            <li className="text-sm text-ink/40">尚未產生追蹤時程——登記「手術切除」治療紀錄後，會以手術日為起點自動排出術後 24 個月的每月追蹤與後三次抽血。</li>
          )}
        </ul>

        {/* 對不上任何一列時程的術後治療（2026-08-26）。來源有二：臨時回診（範本以外，
            而且日期後來又被改過）、舊資料匯入。沒有這一區的話這些紀錄會從畫面上消失，
            而它們照樣進匯出檔——看不到的資料比沒有資料更糟。 */}
        {orphanFollowUpRecords.length > 0 && (
          <div className="mt-4 border-t border-brand-50 pt-3">
            <h3 className="mb-1.5 text-xs font-semibold text-ink/60">
              其他回診治療（無對應時程）
              <InfoTooltip text="治療日期對不到上面任何一列時程的術後治療，多半來自臨時回診或舊資料匯入。要讓它歸位的話，把對應時程列的日期改成同一天即可。" />
            </h3>
            <TreatmentRecordList
              caseId={id}
              records={orphanFollowUpRecords.map(toTreatmentRow)}
              fieldSchemas={treatmentFieldSchemas}
              symptomChangeOptions={symptomChangeOptions}
            />
          </div>
        )}
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
                      {/* 窗期只顯示不擋：檢體都抽了，擋下來只會逼人填假日期（決策 2026-08-20 F-E4） */}
                      {existing?.window_start && existing?.window_end && (
                        <span
                          className="whitespace-nowrap font-data text-xs text-ink/40"
                          title="計畫書規定的採檢窗期"
                        >
                          窗期 {existing.window_start} ~ {existing.window_end}
                        </span>
                      )}
                      {isOutOfWindow(existing?.collected_date, existing?.window_start, existing?.window_end) && (
                        <span
                          className="whitespace-nowrap rounded bg-red-100 px-2 py-0.5 text-xs text-red-700"
                          title="採檢日期落在計畫書窗期之外，匯出時會標記為 protocol deviation"
                        >
                          窗外採檢
                        </span>
                      )}
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
        {/* 一列＝一個採檢日期，每個標記固定一欄（2026-08-27 使用者要求）。
            一次只驗 2/9 項時，那兩個值仍落在自己的欄位上，其餘明寫「未輸入」，
            上下兩次採檢就對得齊，也看得出某個標記的變化。
            欄多的時候整張表自己橫向捲動，頁面本身不會被撐寬。 */}
        {labRows.length > 0 ? (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-brand-100 bg-white py-1.5 pr-3 text-left text-xs font-medium text-ink/60">
                    採檢日期
                  </th>
                  {labColumns.map((c) => (
                    <th
                      key={c.id}
                      className="border-b border-brand-100 px-2 py-1.5 text-left text-xs font-medium text-ink/60"
                      title={c.retired ? `${c.name}（後台已停用，仍保留歷史數據）` : c.name}
                    >
                      <span className="whitespace-nowrap">
                        {c.name}
                        {c.retired && <span className="ml-1 text-ink/25">（已停用）</span>}
                      </span>
                      {/* 單位獨立一行，數值那一格才不用每格重複帶單位 */}
                      <span className="block whitespace-nowrap text-[10px] font-normal text-ink/35">{c.unit || " "}</span>
                    </th>
                  ))}
                  <th className="border-b border-brand-100 px-2 py-1.5 text-left text-xs font-medium text-ink/60">備註</th>
                  <th className="border-b border-brand-100 py-1.5 pl-2 text-right text-xs font-medium text-ink/60">逐筆</th>
                </tr>
              </thead>
              <tbody>
                {labRows.map(({ sampleDate, byMarker }) => {
                  const all = [...byMarker.values()].flatMap((v) => v ?? []);
                  const notes = [...new Set(all.map((r) => r.note).filter(Boolean))].join("・");
                  return (
                    <tr key={sampleDate} className="align-top">
                      <td className="sticky left-0 z-10 whitespace-nowrap border-b border-brand-50 bg-white py-1.5 pr-3 font-data text-ink/80">
                        {sampleDate}
                      </td>
                      {labColumns.map((c) => {
                        const text = labCellText(byMarker.get(c.id));
                        return (
                          <td
                            key={c.id}
                            className={`whitespace-nowrap border-b border-brand-50 px-2 py-1.5 tabular-nums ${
                              text === null ? "text-ink/25" : "text-ink/80"
                            }`}
                          >
                            {text ?? "未輸入"}
                          </td>
                        );
                      })}
                      <td className="border-b border-brand-50 px-2 py-1.5 text-xs text-ink/40">{notes || "—"}</td>
                      <td className="border-b border-brand-50 py-1.5 pl-2 text-right">
                        {/* 刪除仍然是逐筆的（一筆＝一個標記一次採檢），所以收在這裡展開。
                            寬表本身只負責對齊與比對，不承擔逐筆編輯。 */}
                        <details className="text-xs">
                          <summary className="cursor-pointer whitespace-nowrap text-ink/40 hover:text-ink/60">
                            {all.length} 筆 ▾
                          </summary>
                          <ul className="mt-1 space-y-1 text-left">
                            {all.map((r) => {
                              const marker = Array.isArray(r.lab_marker_definitions)
                                ? r.lab_marker_definitions[0]
                                : r.lab_marker_definitions;
                              return (
                                <li key={r.id} className="flex flex-wrap items-center gap-x-2 whitespace-nowrap">
                                  <span className="text-ink/70">{marker?.display_name}</span>
                                  <span className="text-ink/80">
                                    {r.value !== null ? r.value : r.value_text}
                                    {marker?.unit ? ` ${marker.unit}` : ""}
                                  </span>
                                  <span className="text-ink/20">{r.recorded_by}</span>
                                  <form action={deleteLabResultAction}>
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
                          </ul>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-1.5 text-sm text-ink/40">尚無 Lab 數據</p>
        )}
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
            // 草稿（病人版存到一半被中斷）不顯示分數徽章：那些分數是用「已答題目平均」
            // 算出來的，數字看起來完全正常，擺在畫面上只會被當成真的（2026-08-26）。
            const draft = !r.completed_at;
            const isSF36 = q?.name === "SF-36 健康調查簡表" && !draft;
            const isPSQI = q?.name === "匹茲堡睡眠品質量表（PSQI）" && !draft;
            const isJSSClassification = q?.name === "JSS 疤痕診斷分類表" && !draft;
            return (
              <li
                key={r.id}
                className={`rounded-md border p-2 text-sm text-ink/70 ${draft ? "border-amber-200 bg-amber-50/40" : "border-brand-50"}`}
              >
                <div>
                  {new Date(r.submitted_at).toLocaleString("zh-TW")} ・ {q?.name}
                  {draft && (
                    <span className="ml-2 whitespace-nowrap rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      未完成・已答 {Object.keys(answers).length} 題
                    </span>
                  )}
                  {" ・ 填寫人："}
                  {/* submitted_via 分得出 patient／staff，畫面原本一律顯示「診間人員」，
                      等於把「這份是病人自己答的」這件事抹掉——SF-36／PSQI 全都是病人自填。 */}
                  {r.submitted_via === "patient"
                    ? "病人自填"
                    : r.submitted_via === "line_sim"
                    ? "舊LINE路徑（已停用）"
                    : "診間人員"}
                  {/* 直接帶著這一筆的答案進去修改（2026-08-25）：跳題沒填完的可以補，
                      改動的題目會各自記下修改時間，不會另外長出一筆重疊的回覆。 */}
                  {q?.id && (
                    <Link
                      href={`/patient/${id}/questionnaire?questionnaire_id=${q.id}&response_id=${r.id}`}
                      className="ml-2 whitespace-nowrap rounded border border-brand-200 px-1.5 py-0.5 text-xs text-brand-700 hover:bg-brand-50"
                    >
                      修改這一筆
                    </Link>
                  )}
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
                            {/* 後來被改過的題目各自標記（2026-08-25）：哪幾題改的、什麼時候、誰改的。
                                沒改過的不顯示——每一題都掛一行時間會把清單淹掉。 */}
                            {row.updatedAt && (
                              <span className="ml-1.5 whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                                {new Date(row.updatedAt).toLocaleString("zh-TW", {
                                  month: "numeric",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}{" "}
                                修改{row.updatedBy ? `・${row.updatedBy}` : ""}
                              </span>
                            )}
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


    </div>
  );
}
