import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import {
  addDiagnosisAction,
  addTermRecordAction,
  markScheduleItemAction,
  updateCompletenessAction,
  updateConsentAction,
} from "./actions";
import TreatmentForm from "./TreatmentForm";
import PipelineProgress from "./PipelineProgress";
import type { CasePipelineRow } from "@/lib/pipeline";

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
  ] = await Promise.all([
    supabase.from("cases").select("*, doctors(code, name)").eq("id", id).single(),
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
      .select("id, treatment_date, field_values, free_text, recorded_by, treatment_types(name)")
      .eq("case_id", id)
      .order("treatment_date", { ascending: false }),
    supabase.from("case_schedule_items").select("*").eq("case_id", id).order("due_date"),
    supabase
      .from("questionnaire_responses")
      .select("id, submitted_at, submitted_via, questionnaire_templates(name)")
      .eq("case_id", id)
      .order("submitted_at", { ascending: false }),
    supabase.from("photos").select("id, taken_at, body_site, file_path").eq("case_id", id).order("taken_at", { ascending: false }),
    supabase.from("case_data_completeness").select("*").eq("case_id", id),
    supabase.from("v_case_pipeline_progress").select("*").eq("case_id", id).single(),
  ]);

  if (!caseRow) {
    return <p className="text-sm text-red-600">找不到此個案</p>;
  }

  const doctor = Array.isArray(caseRow.doctors) ? caseRow.doctors[0] : caseRow.doctors;
  const termsByStage: Record<string, { id: string; term: string }[]> = { pre: [], intra: [], post: [] };
  (termLibrary ?? []).forEach((t) => termsByStage[t.stage]?.push(t));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-slate-400 hover:underline">
          ← 回個案列表
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-xl font-semibold">{caseRow.research_id}</h1>
          {caseRow.data_source === "legacy_import" && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">舊資料回溯建檔</span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          負責醫師：{doctor?.code} {doctor?.name} ・ 部位：{caseRow.body_site ?? "—"} ・ LINE 綁定：
          {caseRow.line_bound ? "已綁定" : "未綁定"}
        </p>
      </div>

      {/* 收案一條龍進度 */}
      {pipeline && <PipelineProgress row={pipeline as CasePipelineRow} />}

      {/* 資料完整度（僅舊資料回溯建檔顯示） */}
      {completeness && completeness.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-amber-800">資料完整度追蹤（回溯建檔）</h2>
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
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">知情同意書</h2>
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
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">診斷（ICD-9/10）</h2>
        <ul className="mb-3 flex flex-wrap gap-2">
          {(diagnoses ?? []).map((d) => {
            const icd = Array.isArray(d.icd_codes) ? d.icd_codes[0] : d.icd_codes;
            return (
              <li key={d.id} className="rounded bg-slate-100 px-2 py-1 text-xs">
                [{icd?.system}] {icd?.code} {icd?.description_full}
                {d.is_primary && <span className="ml-1 text-blue-600">（主診斷）</span>}
              </li>
            );
          })}
          {(!diagnoses || diagnoses.length === 0) && <li className="text-xs text-slate-400">尚未記錄診斷</li>}
        </ul>
        <form action={addDiagnosisAction} className="flex items-center gap-2">
          <input type="hidden" name="case_id" value={id} />
          <select name="icd_code_id" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            {(icdCodes ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                [{i.system}] {i.code} {i.description_full}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            <input type="checkbox" name="is_primary" /> 主診斷
          </label>
          <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            新增
          </button>
        </form>
      </section>

      {/* 醫學術語紀錄 */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">醫學術語紀錄</h2>
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
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">治療紀錄</h2>
        <div className="mb-4">
          <TreatmentForm caseId={id} treatmentTypes={treatmentTypes ?? []} presets={presets ?? []} />
        </div>
        <ul className="space-y-1">
          {(treatmentRecords ?? []).map((r) => {
            const tt = Array.isArray(r.treatment_types) ? r.treatment_types[0] : r.treatment_types;
            return (
              <li key={r.id} className="text-sm text-slate-600">
                <span className="font-medium">{r.treatment_date}</span> ・ {tt?.name} ・{" "}
                {r.free_text || Object.entries(r.field_values ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ")}
                <span className="ml-2 text-xs text-slate-400">記錄人：{r.recorded_by}</span>
              </li>
            );
          })}
          {(!treatmentRecords || treatmentRecords.length === 0) && <li className="text-sm text-slate-400">尚無治療紀錄</li>}
        </ul>
      </section>

      {/* 追蹤時程 */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">追蹤時程</h2>
        <ul className="space-y-2">
          {(scheduleItems ?? []).map((item) => (
            <li key={item.id} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{item.label}</span>
                <span className="ml-2 text-slate-400">到期 {item.due_date}</span>
                <span className="ml-2 text-xs text-slate-400">{(item.actions ?? []).join("、")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
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
                          className="text-xs text-blue-600 underline"
                        >
                          模擬病人填問卷
                        </Link>
                      ) : (
                        <span className="text-xs text-red-400" title="此時間點標記了填問卷動作，但尚未指定問卷，請至後台時程範本補設定">
                          （未指定問卷）
                        </span>
                      ))}
                    {(item.actions ?? []).includes("photo") && (
                      <Link href={`/patient/${id}/photo/${item.id}`} className="text-xs text-blue-600 underline">
                        模擬病人拍照
                      </Link>
                    )}
                    <form action={markScheduleItemAction}>
                      <input type="hidden" name="case_id" value={id} />
                      <input type="hidden" name="item_id" value={item.id} />
                      <input type="hidden" name="status" value="done" />
                      <button type="submit" className="text-xs text-slate-400 underline">
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
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">問卷回覆紀錄</h2>
        <ul className="space-y-1">
          {(responses ?? []).map((r) => {
            const q = Array.isArray(r.questionnaire_templates) ? r.questionnaire_templates[0] : r.questionnaire_templates;
            return (
              <li key={r.id} className="text-sm text-slate-600">
                {new Date(r.submitted_at).toLocaleString("zh-TW")} ・ {q?.name} ・ 來源：
                {r.submitted_via === "line_sim" ? "模擬病人端" : "診間代填"}
              </li>
            );
          })}
          {(!responses || responses.length === 0) && <li className="text-sm text-slate-400">尚無問卷回覆</li>}
        </ul>
      </section>

      {/* 照片 */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">傷口照片</h2>
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
