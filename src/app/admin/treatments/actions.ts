"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";

export async function addTreatmentTypeAction(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const fieldSchemaRaw = (formData.get("field_schema") as string)?.trim();
  if (!name) return;

  let fieldSchema: unknown[] = [];
  try {
    fieldSchema = fieldSchemaRaw ? JSON.parse(fieldSchemaRaw) : [];
  } catch {
    fieldSchema = [];
  }

  const supabase = supabaseServer();
  await supabase.from("treatment_types").insert({ name, field_schema: fieldSchema });
  revalidatePath("/admin/treatments");
}

export async function addPresetAction(formData: FormData) {
  const treatmentTypeId = formData.get("treatment_type_id") as string;
  const name = (formData.get("name") as string)?.trim();
  const fieldValuesRaw = (formData.get("field_values") as string)?.trim();
  if (!name) return;

  let fieldValues: Record<string, unknown> = {};
  try {
    fieldValues = fieldValuesRaw ? JSON.parse(fieldValuesRaw) : {};
  } catch {
    fieldValues = {};
  }

  const supabase = supabaseServer();
  await supabase.from("treatment_presets").insert({ treatment_type_id: treatmentTypeId, name, field_values: fieldValues });
  revalidatePath("/admin/treatments");
}
