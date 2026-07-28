import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import SubmitButton from "@/components/ui/SubmitButton";
import { IMPORT_TARGET_FIELDS, IMPORT_FIELD_BY_KEY } from "@/lib/importFields";
import {
  saveColumnMappingAction,
  saveMappingTemplateAction,
  applyMappingTemplateAction,
  commitImportRowAction,
  commitAllValidRowsAction,
  rejectImportRowAction,
  deleteBatchAction,
} from "../actions";

const ROW_STATUS_LABEL: Record<string, string> = { pending: "待處理", committed: "已匯入", rejected: "已拒絕" };
const ROW_STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  committed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-slate-100 text-slate-500",
};

const FILTERS = [
  { key: "pending", label: "待處理" },
  { key: "error", label: "有錯誤" },
  { key: "committed", label: "已匯入" },
  { key: "all", label: "全部" },
];

const MAX_LIST_ROWS = 100;

export default async function ImportBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { batchId } = await params;
  const { filter = "pending" } = await searchParams;
  const supabase = supabaseServer();

  const [{ data: batch }, { data: rows }, { data: templates }] = await Promise.all([
    supabase.from("legacy_import_batches").select("*").eq("id", batchId).maybeSingle(),
    supabase.from("legacy_import_rows").select("*").eq("batch_id", batchId).order("row_number"),
    supabase.from("import_mapping_templates").select("id, name").order("name"),
  ]);

  if (!batch) return notFound();

  const allRows = rows ?? [];
  const mapping = (batch.column_mapping ?? {}) as Record<string, string>;
  const sourceHeaders = Object.keys((allRows[0]?.raw_data as Record<string, unknown>) ?? {});
  const samples = allRows.slice(0, 3).map((r) => r.raw_data as Record<string, unknown>);

  const pendingRows = allRows.filter((r) => r.status === "pending");
  const errorRows = pendingRows.filter((r) => (r.validation_errors ?? []).length > 0);
  const readyRows = pendingRows.filter((r) => (r.validation_errors ?? []).length === 0);
  const committedRows = allRows.filter((r) => r.status === "committed");

  const visibleRows = (
    filter === "all"
      ? allRows
      : filter === "error"
        ? errorRows
        : filter === "committed"
          ? committedRows
          : pendingRows
  ).slice(0, MAX_LIST_ROWS);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/import" className="text-sm text-ink/40 hover:underline">
          ← 回匯入批次列表
        </Link>
        <h1 className="mt-1 font-heading text-xl font-medium text-brand-900">{batch.source_filename}</h1>
        <p className="mt-1 text-sm text-ink/50">
          {batch.imported_by} 上傳 ・ 共 {allRows.length} 列 ・ 已匯入 {committedRows.length} 列
        </p>
      </div>

      {/* ① 欄位對應 */}
      <section className="rounded-lg border border-brand-100 bg-white p-4">
        <h2 className="text-sm font-semibold text-brand-900">① 欄位對應</h2>
        <p className="mt-1 text-xs text-ink/50">
          把檔案的每個欄位對應到平台欄位，沒有對應的欄位會被忽略（原始資料仍保留在暫存表）。
          儲存後會立即重新驗證所有待處理列。
        </p>

        <div className="mt-3 flex flex-wrap gap-3">
          <form action={applyMappingTemplateAction} className="flex items-end gap-2">
            <input type="hidden" name="batch_id" value={batchId} />
            <div>
              <label className="block text-xs text-ink/50">套用既有對應範本</label>
              <select name="template_id" required className="mt-1 rounded-md border border-brand-200 px-2 py-1.5 text-sm">
                <option value="">選擇範本…</option>
                {(templates ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <SubmitButton variant="outline" size="sm" pendingText="套用中…">
              套用
            </SubmitButton>
          </form>

          <form action={saveMappingTemplateAction} className="flex items-end gap-2">
            <input type="hidden" name="batch_id" value={batchId} />
            <div>
              <label className="block text-xs text-ink/50">將目前對應存成範本</label>
              <input
                name="template_name"
                required
                placeholder="範本名稱，例：長庚舊表 raw data"
                className="mt-1 w-56 rounded-md border border-brand-200 px-2 py-1.5 text-sm"
              />
            </div>
            <SubmitButton variant="outline" size="sm" pendingText="儲存中…">
              存成範本
            </SubmitButton>
          </form>
        </div>

        <form action={saveColumnMappingAction} className="mt-4 space-y-2">
          <input type="hidden" name="batch_id" value={batchId} />
          <div className="max-h-[28rem] overflow-y-auto rounded-md border border-brand-100">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-brand-50/80 text-left text-xs text-ink/60">
                <tr>
                  <th className="px-3 py-2 font-medium">檔案欄位</th>
                  <th className="px-3 py-2 font-medium">前幾列範例值</th>
                  <th className="px-3 py-2 font-medium">對應到平台欄位</th>
                </tr>
              </thead>
              <tbody>
                {sourceHeaders.map((header) => (
                  <tr key={header} className="border-t border-brand-50 align-top">
                    <td className="px-3 py-1.5 text-xs font-medium text-ink/70">{header}</td>
                    <td className="px-3 py-1.5 text-xs text-ink/40">
                      {samples
                        .map((s) => (s?.[header] === undefined || s?.[header] === "" ? "（空）" : String(s[header])))
                        .join(" / ")}
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        name={`map__${header}`}
                        defaultValue={mapping[header] ?? ""}
                        className="w-full rounded-md border border-brand-200 px-2 py-1 text-xs"
                      >
                        <option value="">（忽略此欄）</option>
                        {IMPORT_TARGET_FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {sourceHeaders.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-xs text-ink/40">
                      此批次沒有資料列
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink/40">
            必要欄位：醫師代碼＋收案年份（或格式正確的研究編號，可從中解析出兩者）。
            研究編號留空時，系統會依「醫師代碼-年份-流水號」自動產生。
          </p>
          <SubmitButton pendingText="儲存並重新驗證…">儲存欄位對應並重新驗證</SubmitButton>
        </form>
      </section>

      {/* ② 驗證預覽 */}
      <section className="rounded-lg border border-brand-100 bg-white p-4">
        <h2 className="text-sm font-semibold text-brand-900">② 匯入前驗證預覽</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "總列數", value: allRows.length, tone: "text-ink/70" },
            { label: "可直接匯入", value: readyRows.length, tone: "text-emerald-700" },
            { label: "有錯誤待修正", value: errorRows.length, tone: "text-red-600" },
            { label: "已匯入", value: committedRows.length, tone: "text-brand-700" },
          ].map((s) => (
            <div key={s.label} className="rounded-md border border-brand-100 bg-paper-raised p-3">
              <p className="text-xs text-ink/50">{s.label}</p>
              <p className={`font-data text-lg font-medium ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <form action={commitAllValidRowsAction}>
            <input type="hidden" name="batch_id" value={batchId} />
            <SubmitButton disabled={readyRows.length === 0} pendingText="匯入中…">
              匯入全部無錯誤的 {readyRows.length} 列
            </SubmitButton>
          </form>
          <form action={deleteBatchAction}>
            <input type="hidden" name="batch_id" value={batchId} />
            <SubmitButton variant="danger" pendingText="刪除中…">
              刪除此批次（不影響已建立的個案）
            </SubmitButton>
          </form>
        </div>
      </section>

      {/* ③ 逐列檢視 */}
      <section className="rounded-lg border border-brand-100 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-brand-900">③ 逐列檢視與修正</h2>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={`/admin/import/${batchId}?filter=${f.key}`}
                className={`rounded px-2 py-0.5 text-xs ${
                  filter === f.key ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-800 hover:bg-brand-100"
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>

        <ul className="mt-3 space-y-2">
          {visibleRows.map((r) => {
            const mapped = (r.mapped_data ?? {}) as Record<string, unknown>;
            const errors = (r.validation_errors ?? []) as string[];
            return (
              <li key={r.id} className="rounded-md border border-brand-100 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-data text-xs text-ink/40">#{r.row_number}</span>
                  <span className={`rounded px-2 py-0.5 text-xs ${ROW_STATUS_COLOR[r.status]}`}>
                    {ROW_STATUS_LABEL[r.status]}
                  </span>
                  {r.research_id && <span className="font-data text-xs text-brand-800">{r.research_id}</span>}
                </div>

                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink/60">
                  {Object.entries(mapped)
                    .filter(([, v]) => v !== null && v !== "")
                    .map(([k, v]) => (
                      <span key={k}>
                        <span className="text-ink/40">{IMPORT_FIELD_BY_KEY.get(k)?.label ?? k}：</span>
                        {String(v)}
                      </span>
                    ))}
                  {Object.values(mapped).every((v) => v === null || v === "") && (
                    <span className="text-ink/40">尚未對應任何欄位</span>
                  )}
                </div>

                {errors.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-xs text-red-600">
                    {errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}

                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-ink/40">檢視原始資料</summary>
                  <div className="mt-1 grid grid-cols-1 gap-x-3 text-xs text-ink/50 sm:grid-cols-2">
                    {Object.entries((r.raw_data ?? {}) as Record<string, unknown>)
                      .filter(([, v]) => v !== null && v !== "")
                      .map(([k, v]) => (
                        <div key={k}>
                          {k}：{String(v)}
                        </div>
                      ))}
                  </div>
                </details>

                {r.status === "pending" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={commitImportRowAction}>
                      <input type="hidden" name="row_id" value={r.id} />
                      <SubmitButton size="sm" disabled={errors.length > 0} pendingText="建立中…">
                        確認建立個案
                      </SubmitButton>
                    </form>
                    <form action={rejectImportRowAction}>
                      <input type="hidden" name="row_id" value={r.id} />
                      <SubmitButton variant="ghost" size="sm" pendingText="處理中…">
                        拒絕此列
                      </SubmitButton>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
          {visibleRows.length === 0 && <li className="text-sm text-ink/40">此篩選條件下沒有資料列</li>}
        </ul>
        {visibleRows.length >= MAX_LIST_ROWS && (
          <p className="mt-2 text-xs text-amber-600">
            只顯示前 {MAX_LIST_ROWS} 列，其餘列可用上方「匯入全部無錯誤的列」一次處理。
          </p>
        )}
      </section>
    </div>
  );
}
