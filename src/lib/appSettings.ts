import { supabaseServer } from "@/lib/supabase";

// 全域設定（app_settings 表）。目前只有測試模式一項。
//
// 為什麼放資料庫而不是瀏覽器：開關要讓**所有裝置同步生效**——平板收案、桌機看資料，
// 兩邊對「現在是不是測試模式」的認知必須一致，否則同一天收的案會有一半沒被標記。

export const TEST_MODE_KEY = "test_mode";

/**
 * 現在是不是測試模式。
 *
 * 讀不到設定（表還沒建、網路瞬斷）時一律回 false＝正式模式。
 * 這個方向是刻意的：把正式資料誤標成測試，之後可能被「刪除所有測試個案」清掉；
 * 反過來把測試資料當正式留著，最多只是多幾筆髒資料要手動刪。
 */
export async function isTestMode(): Promise<boolean> {
  const supabase = supabaseServer();
  const { data } = await supabase.from("app_settings").select("value").eq("key", TEST_MODE_KEY).maybeSingle();
  return data?.value === true;
}
