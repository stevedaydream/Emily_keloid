import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import UploadForm from "./UploadForm";

export default async function KeloidImportPage() {
  const supabase = supabaseServer();
  const { data: batches } = await supabase
    .from("legacy_import_batches")
    .select("id, source_filename, imported_at, imported_by, status, total_rows, committed_rows, column_mapping")
    .order("imported_at", { ascending: false })
    .limit(20);

  const keloidBatches = (batches ?? []).filter(
    (b) => (b.column_mapping as { format?: string } | null)?.format === "keloid-2026-08"
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">批次匯入（部長格式）</h1>
        <p className="mt-1 text-sm text-ink/50">
          助理手動補齊舊病人用。流程：下載空白範本 → 填寫 → 上傳 → 檢視預覽與人工確認清單 → 正式寫入。
          範本的欄位與匯出檔完全相同（同一份定義產生），所以匯出與匯入可以互相對照。
        </p>
      </div>

      <UploadForm />

      <div className="rounded-lg border border-brand-100 bg-paper-raised p-4">
        <h2 className="text-sm font-semibold text-brand-900">最近的匯入批次</h2>
        {keloidBatches.length === 0 ? (
          <p className="mt-2 text-xs text-ink/40">尚無此格式的匯入批次</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {keloidBatches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 text-xs text-ink/60">
                <Link href={`/admin/import-keloid/${b.id}`} className="text-brand-700 underline">
                  {b.source_filename}
                </Link>
                <span>{new Date(b.imported_at).toLocaleString("zh-TW")}</span>
                <span>・{b.imported_by}</span>
                <span className="rounded bg-brand-50 px-1.5 py-0.5">
                  {b.committed_rows}/{b.total_rows} 已寫入
                </span>
                <span className="text-ink/40">{b.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-brand-100 bg-paper-raised p-4 text-xs text-ink/50">
        <h2 className="mb-1 text-sm font-semibold text-brand-900">關於重複匯入</h2>
        <p>
          同一個 <code>Subject_ID</code> 再次匯入時，個案層級欄位會被新值覆蓋（<b>留空的欄位不覆蓋</b>，
          不會把既有資料洗掉）；病灶、治療、追蹤這些子資料則以這次上傳的內容<b>整組取代</b>。
          所以分次補資料時，請把該病人完整的那幾列一起上傳，不要只傳新增的部分。
        </p>
        <p className="mt-2">
          若同編號的個案是「正常收案」建立的，系統會擋下來不自動覆蓋——整組取代會刪掉診間實際登打的治療紀錄。
        </p>
      </div>
    </div>
  );
}
