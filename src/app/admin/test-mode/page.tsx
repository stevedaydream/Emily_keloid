import { supabaseServer } from "@/lib/supabase";
import { isTestMode } from "@/lib/appSettings";
import { canUseMaintenanceTools } from "@/lib/adminPin";
import TestModePanel from "./TestModePanel";

export default async function TestModeAdminPage() {
  const supabase = supabaseServer();
  const [on, { count }, gate] = await Promise.all([
    isTestMode(),
    supabase.from("cases").select("id", { count: "exact", head: true }).eq("is_test", true),
    canUseMaintenanceTools(),
  ]);

  // 維運工具：系統管理者專用，且設了 PIN 之後還要通過 PIN 驗證（2026-08-25）。
  // ⚠️ 這道門擋的是「誤觸」與「順手看看」——決策 #9 全體共用一組帳號，
  // 刻意繞路的人擋不住。IRB 文件要照這個講法寫。
  if (!gate.ok) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="font-heading text-xl font-medium text-brand-900">測試模式</h1>
        <div className="rounded-lg border-2 border-amber-200 bg-amber-50/60 p-4 text-sm">
          <p className="font-medium text-amber-900">
            {gate.reason === "need_pin" ? "需要重新輸入系統管理者 PIN" : "這一頁是給系統管理者用的維運工具"}
          </p>
          <p className="mt-1 text-xs text-ink/60">
            目前狀態：<b>{on ? "測試模式開啟中" : "正式模式"}</b>
            {on && `，已標記 ${count ?? 0} 筆測試個案`}。
            {gate.reason === "need_pin"
              ? "請回到操作者選單重新選一次「系統管理者」並輸入 PIN。"
              : "要切換模式或清除測試資料，請切換到「系統管理者」操作者，或請維運人員處理。"}
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
