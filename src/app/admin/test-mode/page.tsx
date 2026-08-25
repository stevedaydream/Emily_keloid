import { supabaseServer } from "@/lib/supabase";
import { isTestMode } from "@/lib/appSettings";
import TestModePanel from "./TestModePanel";

export default async function TestModeAdminPage() {
  const supabase = supabaseServer();
  const [on, { count }] = await Promise.all([
    isTestMode(),
    supabase.from("cases").select("id", { count: "exact", head: true }).eq("is_test", true),
  ]);

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
