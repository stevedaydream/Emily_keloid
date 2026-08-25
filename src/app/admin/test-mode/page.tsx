import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperatorContext } from "@/lib/operator";
import { isTestMode } from "@/lib/appSettings";
import TestModePanel from "./TestModePanel";

export default async function TestModeAdminPage() {
  const supabase = supabaseServer();
  const [on, { count }, ctx] = await Promise.all([
    isTestMode(),
    supabase.from("cases").select("id", { count: "exact", head: true }).eq("is_test", true),
    getCurrentOperatorContext(),
  ]);

  // 這是維運工具，入口只掛在系統管理者的後台首頁（使用者要求 2026-08-25）。
  // ⚠️ 這裡**不是擋門**——決策 #9 全體共用一組帳號、不分權限，知道網址的人本來就進得來。
  // 所以做法是「講清楚這頁是誰用的」並把開關收起來，而不是假裝擋住了。
  // 正式上線後改成需要 PIN，見 pending.md。
  if (ctx && !ctx.isSystemAdmin) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="font-heading text-xl font-medium text-brand-900">測試模式</h1>
        <div className="rounded-lg border-2 border-amber-200 bg-amber-50/60 p-4 text-sm">
          <p className="font-medium text-amber-900">這一頁是給系統管理者用的維運工具</p>
          <p className="mt-1 text-xs text-ink/60">
            目前狀態：<b>{on ? "測試模式開啟中" : "正式模式"}</b>
            {on && `，已標記 ${count ?? 0} 筆測試個案`}。
            要切換模式或清除測試資料，請切換到「系統管理者」操作者，或請維運人員處理。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="font-heading text-xl font-medium text-brand-900">測試模式</h1>
        <p className="mt-1 text-sm text-ink/50">
          demo／教育訓練期間把開關打開，收出來的個案都會標成「測試」，之後一鍵刪乾淨，
          不必整張表清空（那會連同別人正在操作的個案一起消失）。
        </p>
      </div>
      <TestModePanel on={on} testCount={count ?? 0} />
    </div>
  );
}
