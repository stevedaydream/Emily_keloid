"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { LANDING_PATH, toLandingMode } from "@/lib/operator";
import { ADMIN_PIN_COOKIE, adminPinCookieValue, adminPinIsSet, verifyAdminPin } from "@/lib/adminPin";

const OPERATOR_MAX_AGE = 60 * 60 * 12;

async function commitOperator(name: string, next: string, landingMode: unknown) {
  const cookieStore = await cookies();
  cookieStore.set("keloid_operator", name, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: OPERATOR_MAX_AGE,
  });

  // next 是 proxy 攔截前使用者原本要去的地方，一律尊重它。
  // 只有「沒有特定目的地」（next 是預設的 "/"）時才依身分帶到各自的落點——
  // 否則點 /cases 被要求選身分後，反而會被丟去別的地方。
  if (next !== "/") redirect(next);
  redirect(LANDING_PATH[toLandingMode(landingMode)]);
}

export async function setOperatorAction(formData: FormData) {
  const name = formData.get("name") as string;
  const next = (formData.get("next") as string) || "/";
  if (!name) return;

  const supabase = supabaseServer();
  const { data } = await supabase
    .from("operators")
    .select("landing_mode, is_system_admin")
    .eq("name", name)
    .maybeSingle();

  // 系統管理者要 PIN（pending.md G3）：維運工具一鍵就能影響全站資料，
  // 不該讓拿到共用帳號的人隨手切進來。沒設定 PIN 時完全不擋。
  if (data?.is_system_admin === true && (await adminPinIsSet())) {
    redirect(`/operator/pin?name=${encodeURIComponent(name)}&next=${encodeURIComponent(next)}`);
  }

  await commitOperator(name, next, data?.landing_mode);
}

export type PinFormState = { error: string } | null;

/** PIN 驗證。結果用回傳值傳——throw 出去的訊息在正式環境會被 Next 抹成一段英文。 */
export async function verifyAdminPinAction(_prev: PinFormState, formData: FormData): Promise<PinFormState> {
  const name = (formData.get("name") as string) ?? "";
  const next = (formData.get("next") as string) || "/";
  const pin = ((formData.get("pin") as string) ?? "").trim();
  if (!name) return { error: "缺少操作者" };

  if (!(await verifyAdminPin(pin))) return { error: "PIN 不正確" };

  const token = await adminPinCookieValue();
  const cookieStore = await cookies();
  if (token) {
    cookieStore.set(ADMIN_PIN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: OPERATOR_MAX_AGE,
    });
  }

  const supabase = supabaseServer();
  const { data } = await supabase.from("operators").select("landing_mode").eq("name", name).maybeSingle();
  await commitOperator(name, next, data?.landing_mode);
  return null;
}
