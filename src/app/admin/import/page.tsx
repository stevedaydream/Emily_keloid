import { supabaseServer } from "@/lib/supabase";
import { commitImportRowAction, rejectImportRowAction } from "./actions";

const STATUS_LABEL: Record<string, string> = { pending: "待處理", committed: "已匯入", rejected: "已拒絕" };
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  committed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-slate-100 text-slate-500",
};

export default async function ImportAdminPage() {
  const supabase = supabaseServer();
  const [{ data: batches }, { data: rows }, { data: doctors }] = await Promise.all([
    supabase.from("legacy_import_batches").select("*").order("imported_at", { ascending: false }),
    supabase.from("legacy_import_rows").select("*").order("row_number"),
    supabase.from("doctors").select("id, code, name").eq("active", true),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">舊資料匯入</h1>
        <p className="mt-1 text-sm text-slate-500">
          流程：Excel/CSV 上傳（去識別化，僅含研究編號）→ 欄位對應 → 匯入前驗證預覽 → 人工檢視修正 → 正式寫入個案。
          目前 demo 顯示一批示範匯入資料的檢視/修正/確認流程；正式版可再加上傳介面。
        </p>
      </div>

      {(batches ?? []).map((b) => (
        <section key={b.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-700">{b.source_filename}</h2>
          <p className="mb-3 text-xs text-slate-400">
            匯入人：{b.imported_by} ・ 共 {b.total_rows} 筆 ・ 已匯入 {b.committed_rows} 筆
          </p>
          <div className="mb-3 rounded-md bg-slate-50 p-2 text-xs text-slate-500">
            欄位對應：
            {Object.entries(b.column_mapping ?? {}).map(([from, to]) => (
              <span key={from} className="ml-2 rounded bg-white px-1.5 py-0.5">
                {from} → {String(to)}
              </span>
            ))}
          </div>

          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="py-1 pr-2 font-medium">#</th>
                <th className="py-1 pr-2 font-medium">原始資料</th>
                <th className="py-1 pr-2 font-medium">狀態</th>
                <th className="py-1 pr-2 font-medium">研究編號</th>
                <th className="py-1 pr-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? [])
                .filter((r) => r.batch_id === b.id)
                .map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="py-2 pr-2">{r.row_number}</td>
                    <td className="py-2 pr-2 text-xs text-slate-500">
                      {Object.entries(r.raw_data ?? {}).map(([k, v]) => (
                        <div key={k}>
                          {k}：{String(v) || "（空）"}
                        </div>
                      ))}
                      {(r.validation_errors ?? []).length > 0 && (
                        <div className="mt-1 text-red-500">{(r.validation_errors as string[]).join("；")}</div>
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                    </td>
                    <td className="py-2 pr-2 text-xs">{r.research_id ?? "—"}</td>
                    <td className="py-2 pr-2">
                      {r.status === "pending" && (
                        <form action={commitImportRowAction} className="space-y-1">
                          <input type="hidden" name="row_id" value={r.id} />
                          <input type="hidden" name="batch_id" value={b.id} />
                          <select name="doctor_id" required className="w-full rounded border border-slate-300 px-1 py-0.5 text-xs">
                            {(doctors ?? []).map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.code}
                              </option>
                            ))}
                          </select>
                          <input
                            name="body_site"
                            placeholder="部位"
                            defaultValue={(r.mapped_data as { body_site?: string })?.body_site ?? ""}
                            className="w-full rounded border border-slate-300 px-1 py-0.5 text-xs"
                          />
                          <input
                            name="consent_signed_at"
                            type="date"
                            defaultValue={(r.mapped_data as { consent_signed_at?: string })?.consent_signed_at ?? ""}
                            className="w-full rounded border border-slate-300 px-1 py-0.5 text-xs"
                          />
                          <input name="enrollment_year" type="number" defaultValue={2024} className="w-full rounded border border-slate-300 px-1 py-0.5 text-xs" />
                          <div className="flex gap-1">
                            <button type="submit" className="rounded bg-slate-900 px-2 py-1 text-xs text-white">
                              確認建立個案
                            </button>
                          </div>
                        </form>
                      )}
                      {r.status === "pending" && (
                        <form action={rejectImportRowAction} className="mt-1">
                          <input type="hidden" name="row_id" value={r.id} />
                          <button type="submit" className="text-xs text-slate-400 underline">
                            拒絕此列
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
