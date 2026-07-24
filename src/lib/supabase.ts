import { createClient } from "@supabase/supabase-js";

// 僅供伺服器端使用（Server Components / Server Actions / Route Handlers）。
// 環境變數未加 NEXT_PUBLIC_ 前綴，不會被打包進瀏覽器端 bundle。
export function supabaseServer() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars");
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
