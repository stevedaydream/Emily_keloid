import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import SubmitButton from "@/components/ui/SubmitButton";
import type { DecodedCase } from "@/lib/keloidFormatImport";
import { commitKeloidImportBatchAction, rejectKeloidImportRowAction, deleteKeloidImportBatchAction } from "../actions";

type Row = {
  id: string;
  row_number: number;
  research_id: string | null;
  mapped_data: DecodedCase;
  validation_errors: string[];
  status: string;
  committed_case_id: string | null;
};

export default async function KeloidImportBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const supabase = supabaseServer();

  const [{ data: batch }, { data: rowsRaw }] = await Promise.all([
    supabase.from("legacy_import_batches").select("*").eq("id", batchId).maybeSingle(),
    supabase.from("legacy_import_rows").select("*").eq("batch_id", batchId).order("row_number"),
  ]);
  if (!batch) notFound();

  const rows = (rowsRaw ?? []) as unknown as Row[];
  const isError = (e: string) => !e.startsWith("⚠");
  const blocked = rows.filter((r) => r.status === "pending" && r.validation_errors.some(isError));
  const needsReview = rows.filter(
    (r) => r.status === "pending" && !r.validation_errors.some(isError) && r.validation_errors.length > 0
  );
  const clean = rows.filter((r) => r.status === "pending" && r.validation_errors.length === 0);
  const committed = rows.filter((r) => r.status === "committed");
  const rejected = rows.filter((r) => r.status === "rejected");

  const sizeSummary = (d: DecodedCase) => {
    const l = d.lesions ?? [];
    if (!l.length) return "無病灶";
    return l
      .map((x) => {
        const dims = [x.length_cm, x.width_cm, x.height_cm].filter((v) => v !== null);
        return `部位${x.site_no} ${x.body_site}${dims.length ? ` ${dims.join("*")}cm` : ""}`;
      })
      .join("；");
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/admin/import-keloid" className="text-xs text-brand-700 underline">
          ← 回匯入頁
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{batch.source_filename}</h1>
        <p className="mt-1 text-sm text-ink/50">
          {new Date(batch.imported_at).toLocaleString("zh-TW")}・{batch.imported_by}・
          共 {batch.total_rows} 位病人，已寫入 {batch.committed_rows} 位
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "可直接寫入", n: clean.length, tone: "text-emerald-700" },
          { label: "需人工確認", n: needsReview.length, tone: "text-amber-700" },
          { label: "有錯誤擋住", n: blocked.length, tone: "text-red-600" },
          { label: "已寫入", n: committed.length, tone: "text-brand-800" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-brand-100 bg-paper-raised p-3">
            <p className={`text-2xl font-semibold ${s.tone}`}>{s.n}</p>
            <p className="text-xs text-ink/50">{s.label}</p>
          </div>
        ))}
      </div>

      {(clean.length > 0 || needsReview.length > 0) && (
        <form action={commitKeloidImportBatchAction} className="rounded-lg border border-brand-200 bg-brand-50/40 p-4">
          <input type="hidden" name="batch_id" value={batchId} />
          <p className="text-xs text-ink/60">
            會寫入 <b>{clean.length + needsReview.length}</b> 位病人（可直接寫入 ＋ 需人工確認的都會寫）。
            有錯誤的 {blocked.length} 位不會寫入。
            <br />
            「需人工確認」多半是尺寸解析不確定或有欄位不會匯入——那些內容已保留在病灶備註裡，寫入後仍可在個案頁修改。
            若不想匯入某一位，請先按下方的「不匯入這位」。
          </p>
          <SubmitButton className="mt-3" pendingText="寫入中…">
            正式寫入 {clean.length + needsReview.length} 位病人
          </SubmitButton>
        </form>
      )}

      {[
        { title: "有錯誤，不會寫入", list: blocked, tone: "border-red-200 bg-red-50/40" },
        { title: "需人工確認（仍會寫入）", list: needsReview, tone: "border-amber-200 bg-amber-50/40" },
        { title: "可直接寫入", list: clean, tone: "border-emerald-200 bg-emerald-50/30" },
        { title: "已寫入", list: committed, tone: "border-brand-100 bg-paper-raised" },
        { title: "已剔除", list: rejected, tone: "border-brand-100 bg-paper-raised" },
      ]
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <div key={g.title} className={`rounded-lg border p-4 ${g.tone}`}>
            <h2 className="mb-2 text-sm font-semibold text-ink/80">
              {g.title}（{g.list.length}）
            </h2>
            <ul className="space-y-2">
              {g.list.map((r) => (
                <li key={r.id} className="rounded-md border border-white/60 bg-white/70 p-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{r.research_id ?? "（無編號）"}</span>
                    <span className="text-xs text-ink/50">第 {r.row_number} 位</span>
                    {r.committed_case_id && (
                      <Link href={`/cases/${r.committed_case_id}`} className="text-xs text-brand-700 underline">
                        看個案
                      </Link>
                    )}
                  </div>
                  <p className="mt-0.5 break-words text-xs text-ink/50">{sizeSummary(r.mapped_data)}</p>
                  {r.validation_errors.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {r.validation_errors.map((e, i) => (
                        <li key={i} className={`text-xs ${isError(e) ? "text-red-600" : "text-amber-700"}`}>
                          {e}
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.status === "pending" && (
                    <form action={rejectKeloidImportRowAction} className="mt-1">
                      <input type="hidden" name="row_id" value={r.id} />
                      <input type="hidden" name="batch_id" value={batchId} />
                      <SubmitButton variant="ghost" size="sm" pendingText="處理中…">
                        不匯入這位
                      </SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

      <form action={deleteKeloidImportBatchAction} className="rounded-lg border border-brand-100 p-4">
        <input type="hidden" name="batch_id" value={batchId} />
        <p className="text-xs text-ink/50">
          刪除這批暫存資料。已經寫入正式表的個案不會被刪除，只是這份匯入紀錄消失。
        </p>
        <SubmitButton variant="danger" size="sm" className="mt-2" pendingText="刪除中…">
          刪除這批暫存
        </SubmitButton>
      </form>
    </div>
  );
}
