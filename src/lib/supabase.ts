import { createClient } from "@supabase/supabase-js";

// 僅供伺服器端使用（Server Components / Server Actions / Route Handlers）。
//
// 兩個環境變數都**沒有** `NEXT_PUBLIC_` 前綴，所以不會被打包進瀏覽器端 bundle；
// 全站也沒有任何 "use client" 檔案直接查 Supabase（2026-08-25 實測：把 anon key
// 拿去 grep 打包後的 .next/static，一個字都找不到）。
//
// 金鑰優先序（2026-08-25，pending.md G1）：
//   1. SUPABASE_SERVICE_ROLE_KEY —— 正式用這把。搭配 migration 20260825080000
//      收回 anon 的資料表權限之後，**就算 anon key 外流也開不了資料庫**。
//      這在病歷號與姓名改成明文存雲端之後特別重要（見 project.md 安全性備忘）。
//   2. SUPABASE_ANON_KEY —— 沒設定 service_role 時的退路，讓還沒補環境變數的環境
//      不會整個掛掉。**正式環境不該停在這一步**。
//
// ⚠️ service_role 會繞過 RLS，所以這支只能在伺服器端呼叫。任何一個 "use client" 檔案
// import 到它，金鑰就會進 bundle——這是這個檔案唯一要守的規則。
export function supabaseServer() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY env vars");
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

/** 目前這個環境用的是哪一把金鑰。給 /admin 的健檢用，不回傳金鑰本身。 */
export function supabaseKeyKind(): "service_role" | "anon" | "missing" {
  if (!process.env.SUPABASE_URL) return "missing";
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return "service_role";
  if (process.env.SUPABASE_ANON_KEY) return "anon";
  return "missing";
}
