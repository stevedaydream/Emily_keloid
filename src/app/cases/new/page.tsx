import { supabaseServer } from "@/lib/supabase";
import NewCaseForm from "./NewCaseForm";

export default async function NewCasePage() {
  const supabase = supabaseServer();
  const { data: doctors } = await supabase.from("doctors").select("id, code, name").eq("active", true).order("code");

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">新增個案</h1>
      <p className="text-sm text-slate-500">
        研究編號將依「醫師代碼-年份-流水序號」規則自動產生，不需手動輸入。
        建檔只需要病歷號、姓名與負責醫師，其餘資料由病人自填或在個案頁補；
        病灶部位在個案頁「蟹足腫部位與大小」以人形圖登記（可多處、各自填尺寸）。
      </p>
      <NewCaseForm doctors={doctors ?? []} />
    </div>
  );
}
