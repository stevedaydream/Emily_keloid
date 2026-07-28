import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import UploadForm from "./UploadForm";

const STATUS_LABEL: Record<string, string> = { staged: "待對應欄位", reviewed: "對應完成／檢視中", committed: "已全部處理" };
const STATUS_COLOR: Record<string, string> = {
  staged: "bg-amber-100 text-amber-700",
  reviewed: "bg-sky-100 text-sky-700",
  committed: "bg-emerald-100 text-emerald-700",
};

export default async function ImportAdminPage() {
  const supabase = supabaseServer();
  const { data: batches } = await supabase
    .from("legacy_import_batches")
    .select("*")
    .order("imported_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-xl font-medium text-brand-900">舊資料匯入</h1>
        <p className="mt-1 text-sm text-ink/50">
          流程：上傳去識別化的 Excel/CSV → 欄位對應（可存成範本重複使用）→ 匯入前驗證預覽 → 人工檢視修正 → 正式寫入個案。
        </p>
      </div>

      <UploadForm />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink/60">匯入批次</h2>
        <ul className="space-y-2">
          {(batches ?? []).map((b) => (
            <li key={b.id}>
              <Link
                href={`/admin/import/${b.id}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-100 bg-paper-raised p-3 hover:border-brand-300 hover:bg-brand-50/40"
              >
                <span className="text-sm font-medium text-brand-900">{b.source_filename}</span>
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COLOR[b.status] ?? "bg-slate-100 text-slate-500"}`}>
                  {STATUS_LABEL[b.status] ?? b.status}
                </span>
                <span className="font-data text-xs text-ink/50">
                  {b.committed_rows} / {b.total_rows} 筆已匯入
                </span>
                <span className="text-xs text-ink/40">
                  {b.imported_by} ・ {new Date(b.imported_at).toLocaleString("zh-TW")}
                </span>
              </Link>
            </li>
          ))}
          {(!batches || batches.length === 0) && (
            <li className="rounded-lg border border-dashed border-brand-200 p-4 text-sm text-ink/40">
              尚無匯入批次，請先於上方上傳檔案。
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
