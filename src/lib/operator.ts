import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase";

export type LandingMode = "intake" | "full";

/** 登入後的預設落點。intake＝精簡收案頁（連續收案的醫師），full＝dashboard＋完整後台。 */
export const LANDING_PATH: Record<LandingMode, string> = {
  intake: "/intake",
  full: "/",
};

export async function getCurrentOperator(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("keloid_operator")?.value ?? null;
}

/**
 * 目前操作者 ＋ 他的預設落點。cookie 只存名字（稽核用），landing_mode 每次從 DB 讀，
 * 這樣後台改了落點就立刻生效，不必等 12 小時的 cookie 過期。
 * 查不到對應的操作者（例如後台把人停用/改名）一律當 full，不要把人鎖在收案頁。
 */
export async function getCurrentOperatorContext(): Promise<{ name: string; landingMode: LandingMode } | null> {
  const name = await getCurrentOperator();
  if (!name) return null;

  const supabase = supabaseServer();
  const { data } = await supabase.from("operators").select("landing_mode").eq("name", name).maybeSingle();
  const landingMode: LandingMode = data?.landing_mode === "intake" ? "intake" : "full";
  return { name, landingMode };
}
