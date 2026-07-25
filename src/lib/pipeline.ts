// 收案一條龍（end-to-end intake pipeline）的階段定義。
// 對應 Supabase view `v_case_pipeline_progress` 內的 step_* 布林欄位，順序即流程順序。
export const PIPELINE_STAGES = [
  { key: "step_created", label: "建檔", en: "Created" },
  { key: "step_consent", label: "同意書", en: "Consent" },
  { key: "step_line", label: "LINE 綁定", en: "LINE bound" },
  { key: "step_diagnosis", label: "診斷", en: "Diagnosis" },
  { key: "step_treatment", label: "治療紀錄", en: "Treatment" },
  { key: "step_schedule", label: "追蹤時程", en: "Schedule" },
  { key: "step_followup", label: "追蹤進行", en: "Follow-up" },
  { key: "step_complete", label: "資料完整", en: "Complete" },
] as const;

export type PipelineStageKey = (typeof PIPELINE_STAGES)[number]["key"];

// v_case_pipeline_progress 每列的型別。
export type CasePipelineRow = {
  case_id: string;
  research_id: string;
  doctor_id: string;
  enrollment_year: number | null;
  body_site: string | null;
  data_source: string;
  created_at: string;
  steps_done: number;
  steps_total: number;
  progress_pct: number;
  next_due_date: string | null;
  overdue_count: number;
  pending_fields: number;
} & Record<PipelineStageKey, boolean>;

// 依完成度給進度條顏色（單一色相的順序色階，符合 magnitude 用色原則）。
export function progressTone(pct: number): string {
  if (pct >= 100) return "bg-emerald-500";
  if (pct >= 60) return "bg-sky-500";
  if (pct >= 30) return "bg-sky-400";
  return "bg-sky-300";
}
