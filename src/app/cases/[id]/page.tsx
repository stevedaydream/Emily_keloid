import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import {
  addDiagnosisAction,
  addTermRecordAction,
  markScheduleItemAction,
  updateCompletenessAction,
  updateConsentAction,
  markRadiotherapySessionAction,
  updateBiobankChecklistAction,
  setCaseBodyZoneAction,
  updateDemographicsAction,
  updateOutcomeAction,
  updateLegacyBiobankAction,
  updatePriorHistoryAction,
  addLabResultAction,
} from "./actions";
import TreatmentForm from "./TreatmentForm";
import PipelineProgress from "./PipelineProgress";
import IntakeOptionForm from "./IntakeOptionForm";
import InfoTooltip from "@/components/InfoTooltip";
import type { CasePipelineRow } from "@/lib/pipeline";
import { DOSE_CATEGORY_LABEL } from "@/lib/bodyZones";
import { computeSF36, computePSQI, computeJSSClassification, computeJSSEvaluation } from "@/lib/scoring";

const STAGE_LABEL: Record<string, string> = { pre: "術前", intra: "術中", post: "術後" };
const COMPLETENESS_LABEL: Record<string, string> = {
  has_value: "已有",
  pending: "待補",
  not_applicable: "不適用",
};
const COMPLETENESS_COLOR: Record<string, string> = {
  has_value: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  not_applicable: "bg-slate-100 text-slate-500",
};

const BIOBANK_ITEMS = [
  { key: "tissue_paraffin_block", label: "蠟塊", group: "組織" },
  { key: "tissue_keloid_fibroblast_culture", label: "Keloid fibroblast 原代培養", group: "組織" },
  { key: "tissue_periskin_fibroblast_culture", label: "Periskin fibroblast 原代培養", group: "組織" },
  { key: "blood_pre_op", label: "術前", group: "血液" },
  { key: "blood_post_op_day1", label: "術後治療第一天", group: "血液" },
] as const;

const INTAKE_CATEGORIES = [
  { key: "onset_cause", label: "發生原因" },
  { key: "referral_source", label: "如何得知看診資訊" },
  { key: "diet_education", label: "飲食衛教" },
  { key: "exercise_restriction", label: "運動禁忌衛教" },
] as const;

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
    { data: termLibrary },
    { data: termRecords },
    { data: treatmentTypes },
    { data: presets },
    { data: treatmentRecords },
    { data: scheduleItems },
    { data: responses },
    { data: photos },
    { data: completeness },
    { data: pipeline },
    { data: bodyZones },
    { data: radiotherapySessions },
    { data: biobankItems },
    { data: legacyBiobank },
    { data: intakeOptions },
    { data: intakeRecords },
    { data: labMarkers },
    { data: labResults },
  ] = await Promise.all([
    supabase.from("cases").select("*, doctors(code, name), body_part_zones(display_name, dose_category)").eq("id", id).single(),
    supabase.from("case_diagnoses").select("id, is_primary, icd_codes(code, system, description_full)").eq("case_id", id),
    supabase.from("icd_codes").select("id, code, system, description_full").eq("active", true).order("code"),
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
        "id, treatment_date, field_values, free_text, recorded_by, recurrence_observed, recurrence_description, blood_drawn, blood_drawn_note, treatment_types(name)"
      )
      .eq("case_id", id)
      .order("treatment_date", { ascending: false }),
    supabase.from("case_schedule_items").select("*").eq("case_id", id).order("due_date"),
    supabase
      .from("questionnaire_responses")
      .select(
        "id, submitted_at, submitted_via, questionnaire_templates(name), questionnaire_answers(answer_value, questionnaire_questions(order_no))"
      )
      .eq("case_id", id)
      .order("submitted_at", { ascending: false }),
    supabase.from("photos").select("id, taken_at, body_site, file_path").eq("case_id", id).order("taken_at", { ascending: false }),
    supabase.from("case_data_completeness").select("*").eq("case_id", id),
    supabase.from("v_case_pipeline_progress").select("*").eq("case_id", id).single(),
    supabase.from("body_part_zones").select("id, view, display_name, dose_category").eq("active", true).order("sort_order"),
    supabase.from("radiotherapy_sessions").select("*").eq("case_id", id).order("due_date"),
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
  ]);

  if (!caseRow) {
    return <p className="text-sm text-red-600">找不到此個案</p>;
  }

  const doctor = Array.isArray(caseRow.doctors) ? caseRow.doctors[0] : caseRow.doctors;
  const bodyZone = Array.isArray(caseRow.body_part_zones) ? caseRow.body_part_zones[0] : caseRow.body_part_zones;
  const biobankByKey = new Map((biobankItems ?? []).map((b) => [b.item_key, b]));
  const termsByStage: Record<string, { id: string; term: string }[]> = { pre: [], intra: [], post: [] };
  (termLibrary ?? []).forEach((t) => termsByStage[t.stage]?.push(t));

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

  // JSS 症狀追蹤評估表：以個案最早一筆回覆的總分當基準，計算每筆回覆的 Delta Score（基準分-本次分，正值代表改善）。
  const jssEvalDeltaById = new Map<string, number>();
  {
    const evalResponses = (responses ?? [])
      .filter((r) => {
        const q = Array.isArray(r.questionnaire_templates) ? r.questionnaire_templates[0] : r.questionnaire_templates;
        return q?.name === "JSS 症狀與治療追蹤評估表";
      })
      .map((r) => ({ id: r.id, submitted_at: r.submitted_at, total: computeJSSEvaluation(extractAnswers(r)) }))
      .filter((r): r is { id: string; submitted_at: string; total: number } => r.total !== null)
      .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
    const baseline = evalResponses[0]?.total ?? null;
    if (baseline !== null) {
      for (const r of evalResponses) jssEvalDeltaById.set(r.id, baseline - r.total);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/cases" className="text-sm text-slate-400 hover:underline">
          ← 回個案列表
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-xl font-semibold">{caseRow.research_id}</h1>
          {caseRow.data_source === "legacy_import" && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">舊資料回溯建檔</span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          負責醫師：{doctor?.code} {doctor?.name} ・ LINE 綁定：{caseRow.line_bound ? "已綁定" : "未綁定"}
        </p>
      </div>

      {/* 收案一條龍進度 */}
      {pipeline && <PipelineProgress row={pipeline as CasePipelineRow} />}

      {/* 病人基本資料（舊資料對齊欄位） */}
      <section id="section-demographics" data-nav-section data-nav-label="病人基本資料" className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          病人基本資料
          <InfoTooltip text="記錄性別、年齡、JSW score、家族史、keloid 病史與大小，供研究資料分析使用，可隨時回來更新。" />
        </h2>
        <form action={updateDemographicsAction} className="grid grid-cols-2 gap-3 text-sm">
          <input type="hidden" name="case_id" value={id} />
          <div>
            <label className="block text-xs font-medium text-slate-600">性別</label>
            <select name="sex" defaultValue={caseRow.sex ?? ""} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">未填</option>
              <option value="F">女</option>
              <option value="M">男</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">年齡</label>
            <input
              type="number"
              name="age_at_enrollment"
              defaultValue={caseRow.age_at_enrollment ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">JSW score</label>
            <input
              name="jsw_score"
              defaultValue={caseRow.jsw_score ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Family（家族史）</label>
            <input
              name="family_history"
              defaultValue={caseRow.family_history ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-600">keloid history</label>
            <textarea
              name="keloid_history"
              rows={2}
              defaultValue={caseRow.keloid_history ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-600">keloid 大小</label>
            <textarea
              name="keloid_size"
              rows={2}
              defaultValue={caseRow.keloid_size ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="col-span-2 whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
          >
            更新基本資料
          </button>
        </form>
      </section>

      {/* 病史與過往治療 */}
      <section id="section-priorhistory" data-nav-section data-nav-label="病史與過往治療" className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          病史與過往治療
          <InfoTooltip text="記錄蟹足腫初次發生時間、一般疾病史，以及收案「前」曾在其他院所/自行嘗試過的治療（跟下方治療紀錄追蹤的是收案後的治療不同）。" />
        </h2>
        <form action={updatePriorHistoryAction} className="grid grid-cols-2 gap-3 text-sm">
          <input type="hidden" name="case_id" value={id} />
          <div>
            <label className="block text-xs font-medium text-slate-600">蟹足腫初次發生時間</label>
            <input
              name="keloid_onset_date"
              placeholder="例：2019年初"
              defaultValue={caseRow.keloid_onset_date ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">之前治療的醫師</label>
            <input
              name="prior_treatment_physician"
              defaultValue={caseRow.prior_treatment_physician ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-600">疾病史（一般病史）</label>
            <textarea
              name="disease_history"
              rows={2}
              defaultValue={caseRow.disease_history ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">之前類固醇注射治療（多久/療程）</label>
            <input
              name="prior_steroid_treatment"
              defaultValue={caseRow.prior_steroid_treatment ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">之前中醫治療</label>
            <input
              name="prior_tcm_treatment"
              defaultValue={caseRow.prior_tcm_treatment ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">之前小川令貼布使用史</label>
            <input
              name="prior_ogawa_patch"
              defaultValue={caseRow.prior_ogawa_patch ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">之前放射線治療史</label>
            <input
              name="prior_radiation_treatment"
              defaultValue={caseRow.prior_radiation_treatment ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="col-span-2 whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
          >
            更新病史與過往治療
          </button>
        </form>
      </section>

      {/* 發生原因 / 得知看診資訊 / 飲食運動衛教（後台可維護選單，決策 2026-07-27） */}
      <section id="section-intake" data-nav-section data-nav-label="發生原因與衛教紀錄" className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          發生原因 / 得知看診資訊 / 衛教紀錄
          <InfoTooltip text="四類選單皆為後台可維護清單（非單純勾選），可複選並保留歷次紀錄；飲食衛教/運動禁忌衛教可隨診次重複記錄。" />
        </h2>
        {INTAKE_CATEGORIES.map((cat) => {
          const options = (intakeOptions ?? []).filter((o) => o.category === cat.key);
          const records = (intakeRecords ?? []).filter((r) => r.category === cat.key);
          return (
            <div key={cat.key} className="mb-4 last:mb-0">
              <h3 className="mb-1 text-xs font-semibold text-slate-500">{cat.label}</h3>
              <IntakeOptionForm caseId={id} category={cat.key} options={options} />
              <ul className="space-y-1">
                {records.map((r) => (
                  <li key={r.id} className="break-words text-xs text-slate-500">
                    {new Date(r.recorded_at).toLocaleDateString("zh-TW")} ・ {r.recorded_by} ・{" "}
                    {(r.case_intake_option_record_items ?? [])
                      .map((it: { case_intake_option_lists: { label: string } | { label: string }[] }) =>
                        Array.isArray(it.case_intake_option_lists) ? it.case_intake_option_lists[0]?.label : it.case_intake_option_lists?.label
                      )
                      .join("、") || "（無勾選項目）"}
                    {r.notes && <span className="text-slate-400">（{r.notes}）</span>}
                  </li>
                ))}
                {records.length === 0 && <li className="text-xs text-slate-300">尚無紀錄</li>}
              </ul>
            </div>
          );
        })}
      </section>

      {/* 部位標記 */}
      <section id="section-bodyzone" data-nav-section data-nav-label="主要蟹足腫部位" className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            主要蟹足腫部位
            <InfoTooltip text="點右上「立即拍照」在人形圖點選部位並拍照；系統會依部位自動判斷放射治療的劑量分類。也可在下方下拉選單直接變更部位。" />
          </h2>
          <Link
            href={`/patient/${id}/photo`}
            className="whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-800"
          >
            立即拍照
          </Link>
        </div>
        {bodyZone ? (
          <p className="text-sm text-slate-600">
            {bodyZone.display_name}
            <span className="ml-2 rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
              劑量分類：{DOSE_CATEGORY_LABEL[bodyZone.dose_category]}
            </span>
          </p>
        ) : (
          <p className="text-sm text-amber-600">尚未標記部位（可點右上「立即拍照」選部位，或於下方直接指定）</p>
        )}
        <form action={setCaseBodyZoneAction} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input type="hidden" name="case_id" value={id} />
          <select name="zone_id" className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-sm sm:w-auto sm:flex-1">
            <option value="">變更主要部位…</option>
            {(bodyZones ?? []).map((z) => (
              <option key={z.id} value={z.id}>
                [{z.view === "front" ? "正面" : "背面"}] {z.display_name}（{DOSE_CATEGORY_LABEL[z.dose_category]}）
              </option>
            ))}
          </select>
          <button type="submit" className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 sm:self-start">
            設定
          </button>
        </form>
      </section>

      {/* 資料完整度（僅舊資料回溯建檔顯示） */}
      {completeness && completeness.length > 0 && (
        <section id="section-completeness" data-nav-section data-nav-label="資料完整度追蹤" className="scroll-mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-amber-800">
            資料完整度追蹤（回溯建檔）
            <InfoTooltip text="僅舊資料回溯建檔的個案會顯示。標記每個欄位是「已有」「待補」還是「不適用」，方便日後回頭補齊缺漏資料。" />
          </h2>
          <ul className="space-y-2">
            {completeness.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{c.field_label}</span>
                  {c.note && <span className="ml-2 text-xs text-slate-400">{c.note}</span>}
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
                  <button type="submit" className="text-xs text-slate-400 underline">
                    更新
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 同意書 */}
      <section id="section-consent" data-nav-section data-nav-label="知情同意書" className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          知情同意書
          <InfoTooltip text="紙本簽署流程不變，這裡只記錄簽署日期與確認人，作為系統內的狀態追蹤，不影響實際同意書效力。" />
        </h2>
        <form action={updateConsentAction} className="flex items-center gap-3">
          <input type="hidden" name="case_id" value={id} />
          <input
            type="date"
            name="consent_signed_at"
            defaultValue={caseRow.consent_signed_at ?? ""}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800">
            更新
          </button>
          <span className="text-xs text-slate-400">
            {caseRow.consent_signed_at
              ? `已由 ${caseRow.consent_confirmed_by} 確認`
              : "尚未簽署（紙本簽署流程不變，此僅為狀態記錄）"}
          </span>
        </form>
      </section>

      {/* ICD 診斷 */}
      <section id="section-diagnosis" data-nav-section data-nav-label="診斷（ICD-9/10）" className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          診斷（ICD-9/10）
          <InfoTooltip text="從蟹足腫相關的常用碼清單選擇診斷，可複選（主診斷＋共病），勾選「主診斷」標記主要診斷。" />
        </h2>
        <ul className="mb-3 flex flex-wrap gap-2">
          {(diagnoses ?? []).map((d) => {
            const icd = Array.isArray(d.icd_codes) ? d.icd_codes[0] : d.icd_codes;
            return (
              <li key={d.id} className="min-w-0 max-w-full rounded bg-slate-100 px-2 py-1 text-xs">
                [{icd?.system}] {icd?.code} {icd?.description_full}
                {d.is_primary && <span className="ml-1 whitespace-nowrap text-blue-600">（主診斷）</span>}
              </li>
            );
          })}
          {(!diagnoses || diagnoses.length === 0) && <li className="text-xs text-slate-400">尚未記錄診斷</li>}
        </ul>
        <form action={addDiagnosisAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input type="hidden" name="case_id" value={id} />
          <select
            name="icd_code_id"
            required
            className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-sm sm:w-auto sm:flex-1"
          >
            {(icdCodes ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                [{i.system}] {i.code} {i.description_full}
              </option>
            ))}
          </select>
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            <label className="flex items-center gap-1 whitespace-nowrap text-xs text-slate-500">
              <input type="checkbox" name="is_primary" /> 主診斷
            </label>
            <button
              type="submit"
              className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              新增
            </button>
          </div>
        </form>
      </section>

      {/* 醫學術語紀錄 */}
      <section id="section-terms" data-nav-section data-nav-label="醫學術語紀錄" className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          醫學術語紀錄
          <InfoTooltip text="依術前/術中/術後選擇該階段觀察到的常用術語（可複選），用於統一病歷描述用語，方便後續資料分析比對。" />
        </h2>
        <form action={addTermRecordAction} className="mb-4 space-y-2 rounded-md border border-slate-200 p-3">
          <input type="hidden" name="case_id" value={id} />
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">階段</label>
            <select name="stage" className="rounded-md border border-slate-300 px-2 py-1 text-sm">
              <option value="pre">術前</option>
              <option value="intra">術中</option>
              <option value="post">術後</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {(termLibrary ?? []).map((t) => (
              <label key={t.id} className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs">
                <input type="checkbox" name="term_ids" value={t.id} />
                {STAGE_LABEL[t.stage]}：{t.term}
              </label>
            ))}
          </div>
          <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800">
            新增紀錄
          </button>
        </form>
        <ul className="space-y-1">
          {(termRecords ?? []).map((r) => (
            <li key={r.id} className="text-sm text-slate-600">
              <span className="font-medium">{STAGE_LABEL[r.stage]}</span>（{new Date(r.recorded_at).toLocaleString("zh-TW")} ・{r.recorded_by}）：
              {(r.case_term_record_items ?? [])
                .map((it: { term_library: { term: string } | { term: string }[] }) =>
                  Array.isArray(it.term_library) ? it.term_library[0]?.term : it.term_library?.term
                )
                .join("、") || "（無術語）"}
            </li>
          ))}
          {(!termRecords || termRecords.length === 0) && <li className="text-sm text-slate-400">尚無紀錄</li>}
        </ul>
      </section>

      {/* 治療紀錄 */}
      <section id="section-treatment" data-nav-section data-nav-label="治療紀錄" className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          治療紀錄
          <InfoTooltip text="選擇治療類型並填寫對應欄位；若有常用套組可直接選擇帶入數值，再視情況微調後儲存。若登打「手術切除」且已標記部位，會自動產生放射治療排程。" />
        </h2>
        <div className="mb-4">
          <TreatmentForm caseId={id} treatmentTypes={treatmentTypes ?? []} presets={presets ?? []} />
        </div>
        <ul className="space-y-1">
          {(treatmentRecords ?? []).map((r) => {
            const tt = Array.isArray(r.treatment_types) ? r.treatment_types[0] : r.treatment_types;
            return (
              <li key={r.id} className="break-words text-sm text-slate-600">
                <span className="font-medium">{r.treatment_date}</span> ・ {tt?.name} ・{" "}
                {r.free_text || Object.entries(r.field_values ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ")}
                <span className="ml-2 text-xs text-slate-400">記錄人：{r.recorded_by}</span>
                {r.recurrence_observed && (
                  <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                    復發：{r.recurrence_description || "（未填情形）"}
                  </span>
                )}
                {r.blood_drawn && (
                  <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700">
                    抽血{r.blood_drawn_note ? `：${r.blood_drawn_note}` : ""}
                  </span>
                )}
              </li>
            );
          })}
          {(!treatmentRecords || treatmentRecords.length === 0) && <li className="text-sm text-slate-400">尚無治療紀錄</li>}
        </ul>
      </section>

      {/* 放射治療進度（登打「手術切除」且已標記部位後自動產生） */}
      <section id="section-radiotherapy" data-nav-section data-nav-label="放射治療進度" className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          放射治療進度
          <InfoTooltip text="登打「手術切除」治療紀錄且個案已標記部位時自動產生（胸/肩胛區18Gy×3、耳8Gy×1、其他部位15Gy×2）。每次實際執行後在此標記完成並填實際劑量。" />
        </h2>
        {radiotherapySessions && radiotherapySessions.length > 0 ? (
          <ul className="space-y-2">
            {radiotherapySessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 px-3 py-2 text-sm">
                <span className="whitespace-nowrap">
                  第 {s.fraction_no}/{s.total_fractions} 次 ・ 預定 {s.planned_dose_cgy / 100}Gy ・ 到期 {s.due_date}
                  {s.status === "done" && s.actual_dose_cgy != null && (
                    <span className="ml-2 whitespace-nowrap text-xs text-emerald-600">實際 {s.actual_dose_cgy / 100}Gy（{s.completed_date}）</span>
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                      s.status === "done"
                        ? "bg-emerald-100 text-emerald-700"
                        : s.status === "skipped"
                        ? "bg-slate-100 text-slate-500"
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
                      <input
                        type="number"
                        name="actual_dose_cgy"
                        placeholder={`${s.planned_dose_cgy}`}
                        defaultValue={s.planned_dose_cgy}
                        className="w-20 rounded border border-slate-300 px-1 py-0.5 text-xs"
                      />
                      <button type="submit" className="whitespace-nowrap text-xs text-slate-400 underline">
                        標記完成
                      </button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">
            尚無放療排程。登打「手術切除」治療紀錄時，若個案已標記部位，系統會依部位對應的劑量分類自動產生排程。
          </p>
        )}
      </section>

      {/* 生物資料庫 */}
      <section id="section-biobank" data-nav-section data-nav-label="生物資料庫" className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          生物資料庫
          <InfoTooltip text="勾選蠟塊、Keloid/Periskin fibroblast 原代培養、術前與術後第一天血液是否已收取，並記錄日期；可分次事後補填，不用一次填完。" />
        </h2>
        <form action={updateLegacyBiobankAction} className="mb-3 flex flex-wrap items-end gap-3 rounded-md border border-slate-100 p-3 text-sm">
          <input type="hidden" name="case_id" value={id} />
          <div>
            <label className="block text-xs font-medium text-slate-600">蠟塊編號</label>
            <input
              name="paraffin_block_no"
              defaultValue={legacyBiobank?.paraffin_block_no ?? ""}
              className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">細胞量</label>
            <input
              name="cell_quantity"
              defaultValue={legacyBiobank?.cell_quantity ?? ""}
              className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">儲存盤數</label>
            <input
              name="storage_plate_count"
              defaultValue={legacyBiobank?.storage_plate_count ?? ""}
              className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">凍管位置</label>
            <input
              name="cryotube_location"
              defaultValue={legacyBiobank?.cryotube_location ?? ""}
              className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button type="submit" className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            更新
          </button>
        </form>
        {(["組織", "血液"] as const).map((group) => (
          <div key={group} className="mb-3 last:mb-0">
            <h3 className="mb-1 text-xs font-semibold text-slate-500">{group}</h3>
            <ul className="space-y-1">
              {BIOBANK_ITEMS.filter((it) => it.group === group).map((it) => {
                const existing = biobankByKey.get(it.key);
                return (
                  <li key={it.key} className="flex flex-wrap items-center gap-3 rounded-md border border-slate-100 px-3 py-1.5 text-sm">
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
                        className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                      />
                      <span
                        className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                          existing?.collected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {existing?.collected ? "已收" : "待收"}
                      </span>
                      <button type="submit" className="whitespace-nowrap text-xs text-slate-400 underline">
                        更新
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      {/* Lab 生物標記數據 */}
      <section id="section-lab" data-nav-section data-nav-label="Lab 生物標記數據" className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          Lab 生物標記數據
          <InfoTooltip text="記錄 IgE、Exosome、IL-1α/β、IL-6、TNF-α、MMP2/9 等生物標記檢驗結果，可依採檢日期多次登打；標記清單於後台「Lab 生物標記清單」維護。" />
        </h2>
        <form action={addLabResultAction} className="mb-3 flex flex-wrap items-end gap-3 rounded-md border border-slate-100 p-3 text-sm">
          <input type="hidden" name="case_id" value={id} />
          <div>
            <label className="block text-xs font-medium text-slate-600">標記</label>
            <select name="marker_id" required className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">請選擇…</option>
              {(labMarkers ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                  {m.unit ? `（${m.unit}）` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">採檢日期</label>
            <input
              type="date"
              name="sample_date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">數值</label>
            <input name="value" placeholder="例如 12.5 或 <0.35" className="mt-1 w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">備註</label>
            <input name="note" className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <button type="submit" className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            新增
          </button>
        </form>
        <ul className="divide-y divide-slate-100">
          {(labResults ?? []).map((r) => {
            const marker = Array.isArray(r.lab_marker_definitions) ? r.lab_marker_definitions[0] : r.lab_marker_definitions;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
                <span className="whitespace-nowrap font-medium text-slate-700">{marker?.display_name}</span>
                <span className="whitespace-nowrap text-slate-600">
                  {r.value !== null ? r.value : r.value_text}
                  {marker?.unit ? ` ${marker.unit}` : ""}
                </span>
                <span className="whitespace-nowrap text-xs text-slate-400">{r.sample_date}</span>
                {r.note && <span className="text-xs text-slate-400">・{r.note}</span>}
                <span className="whitespace-nowrap text-xs text-slate-300">・{r.recorded_by}</span>
              </li>
            );
          })}
          {(labResults ?? []).length === 0 && <li className="py-1.5 text-sm text-slate-400">尚無 Lab 數據</li>}
        </ul>
      </section>

      {/* 治療後追蹤結果（舊資料對齊欄位） */}
      <section id="section-outcome" data-nav-section data-nav-label="治療後追蹤結果" className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          治療後追蹤結果
          <InfoTooltip text="記錄長期追蹤的復發狀態、復發日期、統計截止日等研究結果欄位，通常在統計截止時回頭填寫。" />
        </h2>
        <form action={updateOutcomeAction} className="grid grid-cols-2 gap-3 text-sm">
          <input type="hidden" name="case_id" value={id} />
          <div>
            <label className="block text-xs font-medium text-slate-600">是否復發</label>
            <select
              name="recurrence_status"
              defaultValue={caseRow.recurrence_status ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">未填</option>
              <option value="none">無復發</option>
              <option value="recurred">已復發</option>
              <option value="unknown">未知</option>
              <option value="not_applicable">不適用</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">復發日期</label>
            <input
              type="date"
              name="recurrence_date"
              defaultValue={caseRow.recurrence_date ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">治療後復發天數</label>
            <input
              type="number"
              name="days_to_recurrence"
              defaultValue={caseRow.days_to_recurrence ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">統計截止日</label>
            <input
              type="date"
              name="followup_cutoff_date"
              defaultValue={caseRow.followup_cutoff_date ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" name="over_one_year_flag" defaultChecked={caseRow.over_one_year_flag === true} />
            距離治療後超過1年
          </label>
          <button
            type="submit"
            className="col-span-2 whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
          >
            更新追蹤結果
          </button>
        </form>
      </section>

      {/* 追蹤時程 */}
      <section id="section-schedule" data-nav-section data-nav-label="追蹤時程" className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          追蹤時程
          <InfoTooltip text="個案套用時程範本後自動產生的追蹤項目。待處理項目可點連結直接填問卷或拍照，完成後記得標記完成。" />
        </h2>
        <ul className="space-y-2">
          {(scheduleItems ?? []).map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="whitespace-nowrap font-medium">{item.label}</span>
                <span className="ml-2 whitespace-nowrap text-slate-400">到期 {item.due_date}</span>
                <span className="ml-2 whitespace-nowrap text-xs text-slate-400">{(item.actions ?? []).join("、")}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                    item.status === "done"
                      ? "bg-emerald-100 text-emerald-700"
                      : item.status === "skipped"
                      ? "bg-slate-100 text-slate-500"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {item.status === "done" ? "已完成" : item.status === "skipped" ? "已跳過" : "待處理"}
                </span>
                {item.status === "pending" && (
                  <>
                    {(item.actions ?? []).includes("questionnaire") &&
                      (item.questionnaire_id ? (
                        <Link
                          href={`/patient/${id}/questionnaire/${item.id}`}
                          className="whitespace-nowrap text-xs text-blue-600 underline"
                        >
                          填寫問卷
                        </Link>
                      ) : (
                        <span className="whitespace-nowrap text-xs text-red-400" title="此時間點標記了填問卷動作，但尚未指定問卷，請至後台時程範本補設定">
                          （未指定問卷）
                        </span>
                      ))}
                    {(item.actions ?? []).includes("photo") && (
                      <Link href={`/patient/${id}/photo/${item.id}`} className="whitespace-nowrap text-xs text-blue-600 underline">
                        部位標記與拍照
                      </Link>
                    )}
                    <form action={markScheduleItemAction}>
                      <input type="hidden" name="case_id" value={id} />
                      <input type="hidden" name="item_id" value={item.id} />
                      <input type="hidden" name="status" value="done" />
                      <button type="submit" className="whitespace-nowrap text-xs text-slate-400 underline">
                        標記完成
                      </button>
                    </form>
                  </>
                )}
              </div>
            </li>
          ))}
          {(!scheduleItems || scheduleItems.length === 0) && <li className="text-sm text-slate-400">尚未套用時程範本</li>}
        </ul>
      </section>

      {/* 問卷回覆 */}
      <section id="section-responses" data-nav-section data-nav-label="問卷回覆紀錄" className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            問卷回覆紀錄
            <InfoTooltip text="顯示此個案已送出的問卷回覆（如 VSS 量表）。點右上「填寫問卷」可隨時新增，不需等到排定的追蹤時間點。" />
          </h2>
          <Link
            href={`/patient/${id}/questionnaire`}
            className="whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-800"
          >
            填寫問卷
          </Link>
        </div>
        <ul className="space-y-2">
          {(responses ?? []).map((r) => {
            const q = Array.isArray(r.questionnaire_templates) ? r.questionnaire_templates[0] : r.questionnaire_templates;
            const answers = extractAnswers(r);
            const isSF36 = q?.name === "SF-36 健康調查簡表";
            const isPSQI = q?.name === "匹茲堡睡眠品質量表（PSQI）";
            const isJSSClassification = q?.name === "JSS 疤痕診斷分類表";
            const isJSSEvaluation = q?.name === "JSS 症狀與治療追蹤評估表";
            return (
              <li key={r.id} className="rounded-md border border-slate-100 p-2 text-sm text-slate-600">
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
                              ? "bg-slate-100 text-slate-400"
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
                    return (
                      <div className="mt-1">
                        {result ? (
                          <span className="whitespace-nowrap rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                            總分 {result.total} 分 ・ {result.categoryLabel}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">資料不足，無法判定</span>
                        )}
                      </div>
                    );
                  })()}
                {isJSSEvaluation &&
                  (() => {
                    const total = computeJSSEvaluation(answers);
                    const delta = jssEvalDeltaById.get(r.id);
                    return (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="whitespace-nowrap rounded bg-violet-50 px-2 py-0.5 text-xs text-violet-700">
                          總分：{total ?? "資料不足"} / 18
                        </span>
                        {delta !== undefined && (
                          <span
                            className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                              delta > 0
                                ? "bg-emerald-100 text-emerald-700"
                                : delta < 0
                                ? "bg-red-100 text-red-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            Delta Score：{delta > 0 ? `+${delta}` : delta}（較初次{delta > 0 ? "改善" : delta < 0 ? "惡化" : "持平"}）
                          </span>
                        )}
                      </div>
                    );
                  })()}
              </li>
            );
          })}
          {(!responses || responses.length === 0) && <li className="text-sm text-slate-400">尚無問卷回覆</li>}
        </ul>
      </section>

      {/* 照片 */}
      <section id="section-photos" data-nav-section data-nav-label="傷口照片" className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          傷口照片
          <InfoTooltip text="顯示已上傳的傷口照片紀錄。要新增照片請至上方「主要蟹足腫部位」區塊點「立即拍照」。" />
        </h2>
        <ul className="space-y-1">
          {(photos ?? []).map((p) => (
            <li key={p.id} className="text-sm text-slate-600">
              {new Date(p.taken_at).toLocaleString("zh-TW")} ・ {p.body_site ?? "—"} ・ {p.file_path}
            </li>
          ))}
          {(!photos || photos.length === 0) && <li className="text-sm text-slate-400">尚無照片</li>}
        </ul>
      </section>
    </div>
  );
}
