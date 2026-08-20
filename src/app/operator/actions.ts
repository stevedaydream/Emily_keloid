"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { LANDING_PATH, toLandingMode } from "@/lib/operator";

export async function setOperatorAction(formData: FormData) {
  const name = formData.get("name") as string;
  const next = (formData.get("next") as string) || "/";
  if (!name) return;

  const cookieStore = await cookies();
  cookieStore.set("keloid_operator", name, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  // next 是 proxy 攔截前使用者原本要去的地方，一律尊重它。
  // 只有「沒有特定目的地」（next 是預設的 "/"）時才依身分帶到各自的落點——
  // 否則點 /cases 被要求選身分後，反而會被丟去別的地方。
  if (next !== "/") redirect(next);

  const supabase = supabaseServer();
  const { data } = await supabase.from("operators").select("landing_mode").eq("name", name).maybeSingle();
  redirect(LANDING_PATH[toLandingMode(data?.landing_mode)]);
}
