// 收案一條龍（end-to-end intake pipeline）的階段定義。
// 對應 Supabase view `v_case_pipeline_progress` 內的 step_* 布林欄位，順序即流程順序。
// anchor：對應個案頁面上該區塊的 id，點擊階段可直接跳過去；null 代表該階段目前沒有可跳轉的輸入區塊
// （建檔本身恆為真、LINE 綁定要等 Phase 1 串接才有輸入介面，決策 2026-07-27）。
export const PIPELINE_STAGES = [
  { key: "step_created", label: "建檔", en: "Created", anchor: null },
  { key: "step_consent", label: "同意書", en: "Consent", anchor: "section-consent" },
  { key: "step_line", label: "LINE 綁定", en: "LINE bound", anchor: null },
  { key: "step_diagnosis", label: "診斷", en: "Diagnosis", anchor: "section-diagnosis" },
  { key: "step_treatment", label: "治療紀錄", en: "Treatment", anchor: "section-treatment" },
  { key: "step_schedule", label: "追蹤時程", en: "Schedule", anchor: "section-schedule" },
  { key: "step_followup", label: "治療後追蹤", en: "Follow-up", anchor: "section-schedule" },
  { key: "step_complete", label: "資料完整", en: "Complete", anchor: "section-completeness" },
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
  // 「治療後追蹤」的三態版本：時程尚未建立／已建立但還有 pending 項目／全部跑完。
  // step_followup（布林）保留給 steps_done／progress_pct 計算，前端顯示改看這欄位。
  step_followup_status: "not_started" | "in_progress" | "done";
} & Record<PipelineStageKey, boolean>;

// 依完成度給進度條顏色（單一色相的順序色階，符合 magnitude 用色原則）。
export function progressTone(pct: number): string {
  if (pct >= 100) return "bg-emerald-500";
  if (pct >= 60) return "bg-brand-500";
  if (pct >= 30) return "bg-brand-400";
  return "bg-accent-400";
}
