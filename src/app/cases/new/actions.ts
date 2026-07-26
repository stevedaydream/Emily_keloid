"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { generateResearchId } from "@/lib/researchId";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";

export async function createCaseAction(formData: FormData) {
  const supabase = supabaseServer();
  const operator = (await getCurrentOperator()) ?? "未知操作者";

  const doctorId = formData.get("doctor_id") as string;
  const bodyPartZoneId = (formData.get("body_part_zone_id") as string) || null;
  const phoneNumber = formData.get("phone_number") as string;
  const scheduleTemplateId = formData.get("schedule_template_id") as string;
  const consentSignedAt = formData.get("consent_signed_at") as string;

  const { data: doctor } = await supabase
    .from("doctors")
    .select("code")
    .eq("id", doctorId)
    .single();
  if (!doctor) throw new Error("找不到醫師代碼");

  let bodySite: string | null = null;
  if (bodyPartZoneId) {
    const { data: zone } = await supabase.from("body_part_zones").select("display_name").eq("id", bodyPartZoneId).single();
    bodySite = zone?.display_name ?? null;
  }

  const year = new Date().getFullYear();
  const { researchId, sequenceNo } = await generateResearchId(
    supabase,
    doctorId,
    doctor.code,
    year
  );

  const { data: newCase, error } = await supabase
    .from("cases")
    .insert({
      research_id: researchId,
      doctor_id: doctorId,
      enrollment_year: year,
      sequence_no: sequenceNo,
      body_site: bodySite,
      body_part_zone_id: bodyPartZoneId,
      phone_number: phoneNumber || null,
      schedule_template_id: scheduleTemplateId || null,
      consent_signed_at: consentSignedAt || null,
      consent_confirmed_by: consentSignedAt ? operator : null,
      created_by: operator,
    })
    .select("id")
    .single();

  if (error || !newCase) throw error ?? new Error("建立個案失敗");

  // 套用時程範本，產生個案實際時程（可之後個別微調）
  if (scheduleTemplateId) {
    const { data: templateItems } = await supabase
      .from("schedule_template_items")
      .select("label, offset_days, actions, questionnaire_id, id")
      .eq("template_id", scheduleTemplateId);

    if (templateItems && templateItems.length > 0) {
      const today = new Date();
      const rows = templateItems.map((item) => {
        const due = new Date(today);
        due.setDate(due.getDate() + item.offset_days);
        return {
          case_id: newCase.id,
          label: item.label,
          due_date: due.toISOString().slice(0, 10),
          actions: item.actions,
          questionnaire_id: item.questionnaire_id,
          source_template_item_id: item.id,
        };
      });
      await supabase.from("case_schedule_items").insert(rows);
    }
  }

  await logAudit({
    caseId: newCase.id,
    operatorName: operator,
    action: "create_case",
    entity: "cases",
    entityId: newCase.id,
    detail: { research_id: researchId },
  });

  redirect(`/cases/${newCase.id}`);
}
