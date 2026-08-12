import { supabaseServer } from "@/lib/supabase";
import StructuredExportPanel from "./StructuredExportPanel";
import { buttonClasses } from "@/components/ui/buttonStyles";

export default async function ExportPage() {
  const supabase = supabaseServer();
  const [{ count: caseCount }, { count: photoCount }, { data: doctors }] = await Promise.all([
    supabase.from("cases").select("id", { count: "exact", head: true }),
    supabase.from("photos").select("id", { count: "exact", head: true }),
    supabase.from("doctors").select("id, code, name").eq("active", true).order("code"),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">資料匯出</h1>
        <p className="mt-1 text-sm text-ink/50">
          手動觸發匯出，供人工下載後備份至本機硬碟。
        </p>
      </div>

      <StructuredExportPanel doctors={doctors ?? []} caseCount={caseCount ?? 0} />

      <div className="rounded-lg border border-brand-100 bg-paper-raised p-4">
        <h2 className="text-sm font-semibold text-brand-900">② 傷口照片</h2>
        <p className="mt-1 text-xs text-ink/50">
          目前共 {photoCount ?? 0} 張照片，檔名依「研究編號_日期_檔案」命名，打包成 zip。
        </p>
        <a href="/api/export/photos-zip" className={`${buttonClasses("primary")} mt-3`}>
          下載照片（zip）
        </a>
      </div>

      <div className="rounded-lg border border-brand-100 bg-paper-raised p-4">
        <h2 className="text-sm font-semibold text-brand-900">③ 舊資料匯入範本</h2>
        <p className="mt-1 text-xs text-ink/50">
          給助理手動補齊舊病人用的空白範本，欄位與上面的匯出檔<b>完全相同</b>（同一份定義產生），
          另附「填寫說明」與「編碼對照表」兩張參考表。
          病灶尺寸欄可直接照病歷原文貼上（<code>3.9 x 3.1 x 1.4 cm</code>、<code>8*3 cm</code>、
          <code>about 4 cm</code>），匯入時會自動拆成長/寬/高；拆不出來或疑似一格多處病灶的會列進人工確認清單。
        </p>
        <a href="/api/export/import-template" className={`${buttonClasses("outline")} mt-3`}>
          下載空白範本（.xlsx）
        </a>
        <p className="mt-2 text-[11px] text-ink/40">
          填好後的上傳與匯入流程尚未完成，目前請先用「後台管理 → 舊資料匯入」的既有流程。
        </p>
      </div>
    </div>
  );
}
