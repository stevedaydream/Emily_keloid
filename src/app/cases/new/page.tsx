import { supabaseServer } from "@/lib/supabase";
import NewCaseForm from "./NewCaseForm";

export default async function NewCasePage() {
  const supabase = supabaseServer();
  const [{ data: doctors }, { data: templates }, { data: icdCodes }] = await Promise.all([
    supabase.from("doctors").select("id, code, name").eq("active", true).order("code"),
    supabase.from("schedule_templates").select("id, name").eq("active", true).order("name"),
    supabase
      .from("icd_codes")
      .select("id, code, system, description_full, mapping_key")
      .eq("active", true)
      .order("mapping_key")
      .order("system")
      .order("code"),
  ]);

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">新增個案</h1>
      <p className="text-sm text-slate-500">
        研究編號將依「醫師代碼-年份-流水序號」規則自動產生，不需手動輸入。
        病灶部位改在建檔後於個案頁面「蟹足腫部位與大小」以人形圖登記（可多處、各自填尺寸）。
      </p>
      <NewCaseForm doctors={doctors ?? []} templates={templates ?? []} icdCodes={icdCodes ?? []} />
    </div>
  );
}
