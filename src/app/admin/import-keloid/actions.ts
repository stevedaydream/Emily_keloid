"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";
import type { DecodedCase } from "@/lib/keloidFormatImport";

// 部長 2026-08 格式匯入的正式寫入。
//
// 決策 2026-08-12：同一個研究編號再次匯入時
//   - 個案層級欄位：以這次的值覆蓋，但**空值不覆蓋**（避免助理只填部分欄位就把既有資料洗掉）
//   - 病灶／診斷／選項紀錄／治療與追蹤：以這次上傳的內容**整組取代**
//     所以分次補資料時要把該病人完整的那幾列一起上傳（範本的「填寫說明」有寫）
//
// 安全門檻：只對 data_source='legacy_import' 的個案做整組取代。
// 若同編號的個案是正常收案建立的，整組取代會刪掉診間實際登打的治療紀錄，所以直接擋下來要求人工處理。

type StagedRow = {
  id: string;
  research_id: string | null;
  mapped_data: DecodedCase;
  status: string;
};

async function operatorOrThrow() {
  const op = await getCurrentOperator();
  if (!op) throw new Error("未選擇操作者");
  return op;
}

/** 寫入一位病人。回傳 case id。 */
async function commitCase(supabase: SupabaseClient, d: DecodedCase, operator: string): Promise<string> {
  if (d.errors.length > 0) throw new Error(d.errors.join("；"));

  const { data: existing } = await supabase
    .from("cases")
    .select("id, data_source")
    .eq("research_id", d.research_id)
    .maybeSingle();

  if (existing && existing.data_source !== "legacy_import") {
    throw new Error(
      `研究編號 ${d.research_id} 已存在且是「正常收案」建立的。整組取代會刪掉診間實際登打的治療紀錄，因此不自動覆蓋——請人工確認後從個案頁修改。`
    );
  }

  // ---- 個案層級：空值不覆蓋 ----
  const fields: Record<string, unknown> = {
    research_id: d.research_id,
    doctor_id: d.doctor_id,
    enrollment_year: d.enrollment_year,
    sequence_no: d.sequence_no,
    data_source: "legacy_import",
  };
  for (const [k, v] of Object.entries(d.fields)) {
    if (v !== null && v !== "") fields[k] = v;
  }

  let caseId: string;
  if (existing) {
    caseId = existing.id;
    await supabase.from("cases").update(fields).eq("id", caseId);
  } else {
    const { data: created, error } = await supabase
      .from("cases")
      .insert({ ...fields, created_by: operator })
      .select("id")
      .single();
    if (error || !created) throw error ?? new Error("建立個案失敗");
    caseId = created.id;
  }

  // ---- 子資料：整組取代 ----
  // 先刪治療紀錄（radiotherapy_sessions 會 cascade），再刪病灶（treatment_records.lesion_id 已先清掉）
  await supabase.from("treatment_records").delete().eq("case_id", caseId);
  await supabase.from("radiotherapy_sessions").delete().eq("case_id", caseId);
  await supabase.from("case_keloid_lesions").delete().eq("case_id", caseId);
  await supabase.from("case_diagnoses").delete().eq("case_id", caseId);
  const { data: oldOptionRecords } = await supabase
    .from("case_intake_option_records")
    .select("id")
    .eq("case_id", caseId)
    .in("category", ["onset_cause", "keloid_symptom"]);
  for (const r of oldOptionRecords ?? []) {
    await supabase.from("case_intake_option_record_items").delete().eq("record_id", r.id);
    await supabase.from("case_intake_option_records").delete().eq("id", r.id);
  }

  // 病灶
  const lesionIdBySiteNo = new Map<number, string>();
  for (const l of d.lesions) {
    const note = l.size_confidence === "exact" || !l.raw_size ? null : `匯入原文尺寸：${l.raw_size}（${l.size_note}）`;
    const { data: created } = await supabase
      .from("case_keloid_lesions")
      .insert({
        case_id: caseId,
        site_no: l.site_no,
        body_site: l.body_site || "（未指定部位）",
        body_part_zone_id: l.body_part_zone_id,
        length_cm: l.length_cm,
        width_cm: l.width_cm,
        height_cm: l.height_cm,
        note,
      })
      .select("id")
      .single();
    if (created) lesionIdBySiteNo.set(l.site_no, created.id);
  }
  // cases.body_site 是病灶清單的去正規化摘要
  if (d.lesions.length) {
    await supabase.from("cases").update({ body_site: d.lesions.map((l) => l.body_site).join("、") }).eq("id", caseId);
  }

  // 診斷
  if (d.icd_code_ids.length) {
    await supabase.from("case_diagnoses").insert(
      d.icd_code_ids.map((icdId, i) => ({ case_id: caseId, icd_code_id: icdId, is_primary: i === 0 }))
    );
  }

  // 發生原因／目前不適症狀
  const insertOptionRecord = async (category: string, optionIds: string[]) => {
    if (!optionIds.length) return;
    const { data: rec } = await supabase
      .from("case_intake_option_records")
      .insert({ case_id: caseId, category, recorded_by: operator, notes: null })
      .select("id")
      .single();
    if (rec) {
      await supabase
        .from("case_intake_option_record_items")
        .insert(optionIds.map((optionId) => ({ record_id: rec.id, option_id: optionId })));
    }
  };
  await insertOptionRecord("onset_cause", d.onset_cause_option_ids);
  await insertOptionRecord("keloid_symptom", d.keloid_symptom_option_ids);

  // 治療與追蹤紀錄
  const { data: types } = await supabase.from("treatment_types").select("id, name");
  const typeId = (name: string) => (types ?? []).find((t) => t.name === name)?.id ?? null;

  const surgeryTypeId = typeId("手術切除");
  if (d.surgery.date && surgeryTypeId) {
    // 手術部位對到病灶：以 zone 相同者優先，找不到就不掛 lesion_id
    const zoneList = d.surgery.zone_ids.length ? d.surgery.zone_ids : [null];
    for (const [i, zoneId] of zoneList.entries()) {
      const lesion = d.lesions.find((l) => l.body_part_zone_id && l.body_part_zone_id === zoneId);
      const procedure = d.surgery.procedures?.[i] ?? null;
      await supabase.from("treatment_records").insert({
        case_id: caseId,
        treatment_type_id: surgeryTypeId,
        treatment_date: d.surgery.date,
        lesion_id: lesion ? lesionIdBySiteNo.get(lesion.site_no) ?? null : null,
        body_site: lesion?.body_site ?? null,
        recorded_by: operator,
        field_values: procedure ? { method: procedure } : {},
      });
    }
  }

  const rtTypeId = typeId("放射治療");
  const rt = d.radiotherapy;
  if (rt.date && rtTypeId) {
    // 有指定放療部位就各部位一筆（KOR 才推得出來）；沒指定就建一筆不掛病灶的
    for (const zoneId of rt.zone_ids?.length ? rt.zone_ids : [null]) {
      const lesion = zoneId ? d.lesions.find((l) => l.body_part_zone_id === zoneId) : undefined;
      await supabase.from("treatment_records").insert({
        case_id: caseId,
        treatment_type_id: rtTypeId,
        treatment_date: rt.date,
        lesion_id: lesion ? lesionIdBySiteNo.get(lesion.site_no) ?? null : null,
        body_site: lesion?.body_site ?? null,
        recorded_by: operator,
        field_values: {
          ...(rt.doctor ? { rt_doctor: rt.doctor } : {}),
          ...(rt.fractions !== null ? { fractions: String(rt.fractions) } : {}),
          ...(rt.bolus ? { bolus: rt.bolus } : {}),
          ...(rt.electron_beam ? { electron_beam: rt.electron_beam } : {}),
          ...(rt.treatment_response ? { treatment_response: rt.treatment_response } : {}),
          ...(rt.acute_reactions ? { acute_reactions: rt.acute_reactions } : {}),
        },
      });
    }
  }

  const followupTypeId = typeId("追蹤（無治療）");
  if (followupTypeId) {
    for (const v of d.visits) {
      // 手術日與放療日已各自建了紀錄，同一天不重複建追蹤列
      if (v.date === d.surgery.date || v.date === rt.date) continue;
      await supabase.from("treatment_records").insert({
        case_id: caseId,
        treatment_type_id: followupTypeId,
        treatment_date: v.date,
        recorded_by: operator,
        field_values: {},
        recurrence_observed: v.recurrence,
        symptom_change_option_id: v.symptom_change_option_id,
      });
    }
  }

  // 生物資料庫（舊表欄位）
  const bio = d.biobank;
  if (bio.paraffin_block_no || bio.primary_culture || bio.cryotube_location) {
    await supabase.from("biobank_samples").upsert(
      {
        case_id: caseId,
        paraffin_block_no: bio.paraffin_block_no,
        primary_culture: bio.primary_culture,
        cryotube_location: bio.cryotube_location,
      },
      { onConflict: "case_id" }
    );
  }

  return caseId;
}

/** 把整批 pending 的列寫入正式表。 */
export async function commitKeloidImportBatchAction(formData: FormData) {
  const batchId = formData.get("batch_id") as string;
  const operator = await operatorOrThrow();
  const supabase = supabaseServer();

  const { data: rows } = await supabase
    .from("legacy_import_rows")
    .select("id, research_id, mapped_data, status")
    .eq("batch_id", batchId)
    .eq("status", "pending")
    .order("row_number");

  let committed = 0;
  for (const row of (rows ?? []) as unknown as StagedRow[]) {
    try {
      const caseId = await commitCase(supabase, row.mapped_data, operator);
      await supabase
        .from("legacy_import_rows")
        .update({ status: "committed", committed_case_id: caseId, validation_errors: [] })
        .eq("id", row.id);
      committed++;
    } catch (e) {
      await supabase
        .from("legacy_import_rows")
        .update({ validation_errors: [e instanceof Error ? e.message : "寫入失敗"] })
        .eq("id", row.id);
    }
  }

  const { count: remaining } = await supabase
    .from("legacy_import_rows")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .eq("status", "pending");

  await supabase
    .from("legacy_import_batches")
    .update({ status: remaining === 0 ? "committed" : "reviewed", committed_rows: committed })
    .eq("id", batchId);

  await logAudit({
    operatorName: operator,
    action: "commit_keloid_format_import",
    entity: "legacy_import_batches",
    entityId: batchId,
    detail: { committed, remaining },
  });

  revalidatePath(`/admin/import-keloid/${batchId}`);
  revalidatePath("/cases");
}

/** 剔除某一列（不匯入）。 */
export async function rejectKeloidImportRowAction(formData: FormData) {
  const rowId = formData.get("row_id") as string;
  const batchId = formData.get("batch_id") as string;
  await operatorOrThrow();
  const supabase = supabaseServer();
  await supabase.from("legacy_import_rows").update({ status: "rejected" }).eq("id", rowId);
  revalidatePath(`/admin/import-keloid/${batchId}`);
}

/** 刪除整批暫存（尚未寫入正式表的資料）。 */
export async function deleteKeloidImportBatchAction(formData: FormData) {
  const batchId = formData.get("batch_id") as string;
  await operatorOrThrow();
  const supabase = supabaseServer();
  await supabase.from("legacy_import_rows").delete().eq("batch_id", batchId);
  await supabase.from("legacy_import_batches").delete().eq("id", batchId);
  revalidatePath("/admin/import-keloid");
}
