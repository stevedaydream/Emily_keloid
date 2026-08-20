import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase";

/**
 * 登入後的落點。2026-08-20 前只有 intake|full 兩個值，而且它同時決定導覽列長什麼樣；
 * 部長退出收案後那個二分失去前提（見 pending.md F-A），導覽列合併成一張，
 * 這個欄位就退化成純粹的「登入後落在哪一頁」，所以值直接等於頁面。
 */
export type LandingMode = "clinic_today" | "intake" | "dashboard" | "admin";

export const LANDING_PATH: Record<LandingMode, string> = {
  clinic_today: "/clinic-today",
  intake: "/intake",
  dashboard: "/",
  admin: "/admin",
};

export const LANDING_LABEL: Record<LandingMode, string> = {
  clinic_today: "今日門診",
  intake: "收案",
  dashboard: "儀表板",
  admin: "後台管理",
};

export const LANDING_OPTIONS = (Object.keys(LANDING_PATH) as LandingMode[]).map((value) => ({
  value,
  label: LANDING_LABEL[value],
}));

/** 查不到或值不認得時一律當儀表板，不要把人鎖在某一頁。 */
export function toLandingMode(raw: unknown): LandingMode {
  return raw === "clinic_today" || raw === "intake" || raw === "admin" ? raw : "dashboard";
}

export async function getCurrentOperator(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("keloid_operator")?.value ?? null;
}

/**
 * 目前操作者 ＋ 他的動線設定。cookie 只存名字（稽核用），其餘每次從 DB 讀，
 * 這樣後台改了設定就立刻生效，不必等 12 小時的 cookie 過期。
 */
export async function getCurrentOperatorContext(): Promise<{
  name: string;
  landingMode: LandingMode;
  navCompact: boolean;
  devMobileMapping: boolean;
} | null> {
  const name = await getCurrentOperator();
  if (!name) return null;

  const supabase = supabaseServer();
  const { data } = await supabase
    .from("operators")
    .select("landing_mode, nav_compact, dev_mobile_mapping")
    .eq("name", name)
    .maybeSingle();
  return {
    name,
    landingMode: toLandingMode(data?.landing_mode),
    navCompact: data?.nav_compact === true,
    devMobileMapping: data?.dev_mobile_mapping === true,
  };
}
