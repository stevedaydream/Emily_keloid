import { PIPELINE_STAGES, type CasePipelineRow, progressTone } from "@/lib/pipeline";

// 單一個案的「收案一條龍」進度條 + 階段點。純伺服器端渲染，無互動。
export default function PipelineProgress({ row }: { row: CasePipelineRow }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">收案一條龍進度</h2>
        <span className="text-sm font-semibold text-slate-800">
          {row.steps_done}/{row.steps_total} ・ {row.progress_pct}%
        </span>
      </div>

      {/* 進度條 */}
      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${progressTone(row.progress_pct)}`}
          style={{ width: `${row.progress_pct}%` }}
        />
      </div>

      {/* 八個階段點 */}
      <ol className="flex flex-wrap gap-x-2 gap-y-3">
        {PIPELINE_STAGES.map((stage, i) => {
          const done = row[stage.key];
          return (
            <li key={stage.key} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  done ? "bg-emerald-500 text-white" : "border border-slate-300 bg-white text-slate-400"
                }`}
                title={stage.en}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={`text-xs ${done ? "text-slate-700" : "text-slate-400"}`}>{stage.label}</span>
            </li>
          );
        })}
      </ol>

      {(row.next_due_date || row.overdue_count > 0 || row.pending_fields > 0) && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {row.next_due_date && (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">下次到期 {row.next_due_date}</span>
          )}
          {row.overdue_count > 0 && (
            <span className="rounded bg-red-100 px-2 py-0.5 text-red-700">逾期 {row.overdue_count} 項</span>
          )}
          {row.pending_fields > 0 && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700">待補 {row.pending_fields} 欄</span>
          )}
        </div>
      )}
    </section>
  );
}
