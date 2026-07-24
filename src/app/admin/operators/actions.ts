"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";

export async function addOperatorAction(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const role = (formData.get("role") as string)?.trim() || null;
  if (!name) return;
  const supabase = supabaseServer();
  await supabase.from("operators").insert({ name, role });
  revalidatePath("/admin/operators");
}

export async function toggleOperatorActiveAction(formData: FormData) {
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  const supabase = supabaseServer();
  await supabase.from("operators").update({ active: !active }).eq("id", id);
  revalidatePath("/admin/operators");
}
