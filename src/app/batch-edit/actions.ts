"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";
import { onsetMonthToDate } from "@/lib/onsetMonth";

// 批次編輯頁只開放「一個案一格」的純量欄位；家族史、prior_* 那些有專用輸入元件的欄位，
// 以及病灶這種一對多結構，一律走右側抽屜用既有元件編輯，避免在表格裡打出格式不一致的自由文字。
const EDITABLE_FIELDS = {
  sex: "text",
  age_at_enrollment: "int",
  phone_number: "text",
  consent_signed_at: "date",
  jsw_score: "text",
  recurrence_status: "text",
  recurrence_date: "date",
  followup_cutoff_date: "date",
  notes: "text",
} as const;

export type EditableField = keyof typeof EDITABLE_FIELDS;

const SEX_VALUES = ["M", "F", "other", "unknown"];
const RECURRENCE_VALUES = ["none", "recurred", "unknown", "not_applicable"];

export type BatchEdit = { caseId: string; field: string; value: string };

function coerce(field: EditableField, raw: string): { ok: true; value: string | number | null } | { ok: false; error: string } {
  const text = (raw ?? "").trim();
  if (!text) return { ok: true, value: null };

  switch (EDITABLE_FIELDS[field]) {
    case "int": {
      const n = Number(text);
      if (Number.isNaN(n)) return { ok: false, error: `${field}「${text}」不是數字` };
      if (field === "age_at_enrollment" && (n < 0 || n > 130)) return { ok: false, error: `年齡「${text}」超出 0-130` };
      return { ok: true, value: Math.round(n) };
    }
    case "date": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { ok: false, error: `${field}「${text}」不是 YYYY-MM-DD 格式` };
      return { ok: true, value: text };
    }
    default: {
      if (field === "sex" && !SEX_VALUES.includes(text)) return { ok: false, error: `性別「${text}」不是合法值` };
      if (field === "recurrence_status" && !RECURRENCE_VALUES.includes(text)) {
        return { ok: false, error: `復發狀態「${text}」不是合法值` };
      }
      return { ok: true, value: text };
    }
  }
}

/**
 * 一次寫入表格上累積的所有變更。同一個案的多個欄位會合併成一次 update，
 * 整批只寫一筆稽核紀錄（帶變更清單），避免每格一筆把 audit_log 灌爆。
 */
export async function saveBatchEditsAction(edits: BatchEdit[]): Promise<{ saved: number; errors: string[] }> {
  if (!Array.isArray(edits) || edits.length === 0) return { saved: 0, errors: [] };

  const operator = (await getCurrentOperator()) ?? "未知操作者";
  const supabase = supabaseServer();
  const errors: string[] = [];

  // caseId -> { 欄位: 值 }
  const byCase = new Map<string, Record<string, string | number | null>>();
  for (const edit of edits) {
    if (!(edit.field in EDITABLE_FIELDS)) {
      errors.push(`欄位「${edit.field}」不允許在批次編輯頁修改`);
      continue;
    }
    const result = coerce(edit.field as EditableField, edit.value);
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    const bucket = byCase.get(edit.caseId) ?? {};
    bucket[edit.field] = result.value;
    byCase.set(edit.caseId, bucket);
  }

  let saved = 0;
  for (const [caseId, changes] of byCase) {
    const { error } = await supabase.from("cases").update(changes).eq("id", caseId);
    if (error) {
      errors.push(`${caseId}：${error.message}`);
      continue;
    }
    saved += Object.keys(changes).length;
    await logAudit({
      caseId,
      operatorName: operator,
      action: "batch_edit_case",
      entity: "cases",
      entityId: caseId,
      detail: { changes },
    });
  }

  revalidatePath("/batch-edit");
  return { saved, errors };
}

// 抽屜裡那些「有專用輸入元件」的欄位。刻意不重用個案頁的 updateDemographicsAction／
// updatePriorHistoryAction：那兩支會一次寫入整個表單的所有欄位，抽屜只送部分欄位會把其餘欄位清成 null。
const NARRATIVE_FIELDS = [
  "family_history",
  "disease_history",
  "keloid_onset_date",
  "prior_treatment_physician",
  "prior_steroid_treatment",
  "prior_tcm_treatment",
  "prior_ogawa_patch",
  "prior_radiation_treatment",
] as const;

export async function updateCaseNarrativeAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  if (!caseId) return;

  const operator = (await getCurrentOperator()) ?? "未知操作者";
  const supabase = supabaseServer();

  const changes: Record<string, string | null> = {};
  for (const field of NARRATIVE_FIELDS) {
    // 表單沒有送出的欄位完全不碰，避免誤清
    if (!formData.has(field)) continue;
    changes[field] = ((formData.get(field) as string) ?? "").trim() || null;
  }
  // 初次發生時間的輸入是 <input type="month">（`YYYY-MM`），補成當月 1 日才寫得進 date 欄位
  if ("keloid_onset_date" in changes) changes.keloid_onset_date = onsetMonthToDate(changes.keloid_onset_date);
  if (Object.keys(changes).length === 0) return;

  await supabase.from("cases").update(changes).eq("id", caseId);
  await logAudit({
    caseId,
    operatorName: operator,
    action: "batch_edit_case_detail",
    entity: "cases",
    entityId: caseId,
    detail: { fields: Object.keys(changes) },
  });

  revalidatePath("/batch-edit");
}

/** 抽屜要用的單一個案細節：點開才載入，不預先撈全部個案的資料。 */
export async function getCaseDetailAction(caseId: string) {
  const supabase = supabaseServer();

  const [
    { data: caseRow },
    { data: lesions },
    { data: zones },
    { data: treatments },
    { data: rtSessions },
    { data: photos },
    { data: scheduleItems },
    { data: familyOptions },
  ] = await Promise.all([
      supabase
        .from("cases")
        .select(
          "id, research_id, patient_name, family_history, disease_history, keloid_onset_date, prior_treatment_physician, prior_steroid_treatment, prior_tcm_treatment, prior_ogawa_patch, prior_radiation_treatment"
        )
        .eq("id", caseId)
        .single(),
      supabase
        .from("case_keloid_lesions")
        .select("*, body_part_zones(display_name, dose_category)")
        .eq("case_id", caseId)
        .order("site_no"),
      supabase.from("body_part_zones").select("id, zone_key, view, display_name, dose_category").eq("active", true).order("sort_order"),
      supabase
        .from("treatment_records")
        .select("id, treatment_date, body_site, recurrence_observed, treatment_types(name)")
        .eq("case_id", caseId)
        .order("treatment_date", { ascending: false })
        .limit(5),
      supabase.from("radiotherapy_sessions").select("id, fraction_no, status, lesion_id").eq("case_id", caseId),
      supabase.from("photos").select("id, taken_at, body_site, lesion_id").eq("case_id", caseId).order("taken_at", { ascending: false }).limit(8),
      supabase
        .from("case_schedule_items")
        .select("id, label, due_date, status")
        .eq("case_id", caseId)
        .eq("status", "pending")
        .order("due_date"),
      supabase
        .from("case_intake_option_lists")
        .select("id, label")
        .eq("category", "family_disease")
        .eq("active", true)
        .order("sort_order"),
    ]);

  return {
    caseRow,
    lesions: lesions ?? [],
    zones: zones ?? [],
    treatments: treatments ?? [],
    rtDone: (rtSessions ?? []).filter((s) => s.status === "done").length,
    rtTotal: (rtSessions ?? []).length,
    photos: photos ?? [],
    pendingSchedule: scheduleItems ?? [],
    familyOptions: familyOptions ?? [],
  };
}
