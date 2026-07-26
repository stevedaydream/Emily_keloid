import { supabaseServer } from "@/lib/supabase";
import NewCaseForm from "./NewCaseForm";

export default async function NewCasePage() {
  const supabase = supabaseServer();
  const [{ data: doctors }, { data: templates }, { data: zones }] = await Promise.all([
    supabase.from("doctors").select("id, code, name").eq("active", true).order("code"),
    supabase.from("schedule_templates").select("id, name").eq("active", true).order("name"),
    supabase.from("body_part_zones").select("id, zone_key, view, display_name, dose_category").eq("active", true).order("sort_order"),
  ]);

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">新增個案</h1>
      <p className="text-sm text-slate-500">
        研究編號將依「醫師代碼-年份-流水序號」規則自動產生，不需手動輸入。
      </p>
      <NewCaseForm doctors={doctors ?? []} templates={templates ?? []} zones={zones ?? []} />
    </div>
  );
}
