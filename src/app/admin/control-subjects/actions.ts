"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";

/**
 * 對照組＝健康受試者，一個人一次抽血（決策 2026-08-20，見 pending.md F-F）。
 * 刻意不放進 cases：他們沒有病灶、診斷、手術、追蹤、問卷，
 * 塞進去會讓匯出的 Basic Info 有 200 欄以上結構性空白，並污染以個案為單位的統計。
 */
async function nextSubjectCode(supabase: ReturnType<typeof supabaseServer>, year: number) {
  const { data } = await supabase
    .from("control_subjects")
    .select("sequence_no")
    .eq("enrollment_year", year)
    .order("sequence_no", { ascending: false })
    .limit(1);
  const sequenceNo = (data?.[0]?.sequence_no ?? 0) + 1;
  return { sequenceNo, subjectCode: `CTL-${year}-${String(sequenceNo).padStart(3, "0")}` };
}

export async function addControlSubjectAction(formData: FormData) {
  const supabase = supabaseServer();
  const operator = (await getCurrentOperator()) ?? "未知操作者";
  const year = new Date().getFullYear();
  const { sequenceNo, subjectCode } = await nextSubjectCode(supabase, year);

  const ageRaw = (formData.get("age_at_enrollment") as string) ?? "";
  await supabase.from("control_subjects").insert({
    subject_code: subjectCode,
    enrollment_year: year,
    sequence_no: sequenceNo,
    sex: (formData.get("sex") as string) || null,
    age_at_enrollment: ageRaw ? Number(ageRaw) : null,
    consent_signed_at: (formData.get("consent_signed_at") as string) || null,
    consent_confirmed_by: (formData.get("consent_signed_at") as string) ? operator : null,
    blood_draw_date: (formData.get("blood_draw_date") as string) || null,
    notes: ((formData.get("notes") as string) ?? "").trim() || null,
    created_by: operator,
  });

  await logAudit({
    operatorName: operator,
    action: "add_control_subject",
    entity: "control_subjects",
    detail: { subjectCode },
  });
  revalidatePath("/admin/control-subjects");
}

export async function updateControlSubjectAction(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = supabaseServer();
  const operator = (await getCurrentOperator()) ?? "未知操作者";
  const ageRaw = (formData.get("age_at_enrollment") as string) ?? "";
  const consent = (formData.get("consent_signed_at") as string) || null;

  await supabase
    .from("control_subjects")
    .update({
      sex: (formData.get("sex") as string) || null,
      age_at_enrollment: ageRaw ? Number(ageRaw) : null,
      consent_signed_at: consent,
      consent_confirmed_by: consent ? operator : null,
      blood_draw_date: (formData.get("blood_draw_date") as string) || null,
      notes: ((formData.get("notes") as string) ?? "").trim() || null,
    })
    .eq("id", id);

  await logAudit({ operatorName: operator, action: "update_control_subject", entity: "control_subjects", entityId: id });
  revalidatePath("/admin/control-subjects");
}

export async function deleteControlSubjectAction(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = supabaseServer();
  await supabase.from("control_subjects").delete().eq("id", id);
  revalidatePath("/admin/control-subjects");
}
