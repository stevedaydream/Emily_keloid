import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { PIPELINE_STAGES, type CasePipelineRow, progressTone } from "@/lib/pipeline";
import InfoTooltip from "@/components/InfoTooltip";
import CaseSearchBox from "@/components/CaseSearchBox";

type DashboardStats = {
  total_cases: number;
  normal_cases: number;
  legacy_cases: number;
  consent_signed: number;
  line_bound: number;
  recurred_cases: number;
  recurrence_known: number;
  enrolled_this_year: number;
  pending_items: number;
  overdue_items: number;
  avg_pipeline_pct: number;
};

function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

// 單一色相順序色階的水平長條清單（magnitude 用途，單一系列不需圖例）。
function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3 text-sm">
          <span className="w-32 shrink-0 truncate text-slate-600" title={r.label}>
            {r.label}
          </span>
          <span className="relative h-4 flex-1 overflow-hidden rounded bg-slate-100">
            <span
              className="absolute left-0 top-0 h-full rounded bg-sky-500"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </span>
          <span className="w-8 shrink-0 text-right tabular-nums text-slate-500">{r.value}</span>
        </li>
      ))}
      {rows.length === 0 && <li className="text-sm text-slate-400">尚無資料</li>}
    </ul>
  );
}

function StatTile({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
}) {
  const content = (
    <>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400 hover:bg-slate-50">
        {content}
      </Link>
    );
  }
  return <div className="rounded-lg border border-slate-200 bg-white p-4">{content}</div>;
}

function countBy<T>(rows: T[], key: (r: T) => string | null | undefined) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r) ?? "（未填）";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage: stageFilter } = await searchParams;
  const supabase = supabaseServer();

  const [{ data: statsRow }, { data: pipelineRaw }, { data: casesRaw }] = await Promise.all([
    supabase.from("v_dashboard_stats").select("*").single(),
    supabase.from("v_case_pipeline_progress").select("*").order("progress_pct", { ascending: true }),
    supabase.from("cases").select("id, enrollment_year, body_site, data_source, doctors(code, name)"),
  ]);

  const stats = (statsRow ?? {}) as Partial<DashboardStats>;
  const allPipeline = (pipelineRaw ?? []) as CasePipelineRow[];
  const cases = casesRaw ?? [];

  const incompleteCounts = PIPELINE_STAGES.map((s) => ({
    ...s,
    missing: allPipeline.filter((row) => !row[s.key]).length,
  })).filter((s) => s.missing > 0);

  const activeStage = PIPELINE_STAGES.find((s) => s.key === stageFilter);
  const pipeline = activeStage ? allPipeline.filter((row) => !row[activeStage.key]) : allPipeline;

  const byDoctor = countBy(cases, (c) => {
    const d = Array.isArray(c.doctors) ? c.doctors[0] : c.doctors;
    return d ? `${d.code} ${d.name}` : null;
  });
  const byYear = countBy(cases, (c) => (c.enrollment_year ? String(c.enrollment_year) : null)).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  const bySite = countBy(cases, (c) => c.body_site);
  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">統計儀表板 Dashboard</h1>
        <Link href="/cases" className="text-sm text-slate-400 hover:underline">
          個案列表 →
        </Link>
      </div>

      <CaseSearchBox redirectTo="/cases" />

      {/* KPI 卡片 */}
      <section id="section-kpi" data-nav-section data-nav-label="KPI 卡片" className="scroll-mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="總個案數 Total cases" value={String(stats.total_cases ?? 0)} href="/cases" />
        <StatTile
          label="本年度收案 Enrolled this year"
          value={String(stats.enrolled_this_year ?? 0)}
          href={`/cases?year=${currentYear}`}
        />
        <StatTile
          label="來源 Source"
          value={`${stats.normal_cases ?? 0} / ${stats.legacy_cases ?? 0}`}
          hint="正常收案 / 舊資料回溯"
        />
        <StatTile
          label="平均收案進度 Avg pipeline"
          value={`${stats.avg_pipeline_pct ?? 0}%`}
          href="#pipeline-board"
        />
        <StatTile
          label="同意書簽署 Consent"
          value={pct(stats.consent_signed ?? 0, stats.total_cases ?? 0)}
          hint={`${stats.consent_signed ?? 0} / ${stats.total_cases ?? 0}`}
          href="/cases?consent=signed"
        />
        <StatTile
          label="LINE 綁定 LINE bound"
          value={pct(stats.line_bound ?? 0, stats.total_cases ?? 0)}
          hint={`${stats.line_bound ?? 0} / ${stats.total_cases ?? 0}`}
          href="/cases?line=bound"
        />
        <StatTile
          label="復發率 Recurrence"
          value={pct(stats.recurred_cases ?? 0, stats.recurrence_known ?? 0)}
          hint={`${stats.recurred_cases ?? 0} / ${stats.recurrence_known ?? 0} 已知結果`}
          href="/cases?recurrence=recurred"
        />
        <StatTile
          label="逾期時程 Overdue"
          value={String(stats.overdue_items ?? 0)}
          hint={`待處理 ${stats.pending_items ?? 0} 項`}
          href="#pipeline-board"
        />
      </section>

      {/* 收案一條龍進度看板 */}
      <section id="pipeline-board" data-nav-section data-nav-label="收案一條龍進度看板" className="scroll-mt-4 rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="whitespace-nowrap text-sm font-semibold text-slate-700">收案一條龍進度看板</h2>
            <InfoTooltip text="點下方階段標籤可篩選出「該階段尚未完成」的個案；表頭上的●/○也可以點擊直接跳到該個案對應的區塊。" />
          </div>
          <span className="whitespace-nowrap text-xs text-slate-400">依完成度由低到高排序，優先處理落後個案</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2">
          <span className="whitespace-nowrap text-xs text-slate-400">依階段篩選未完成：</span>
          {incompleteCounts.map((s) => (
            <Link
              key={s.key}
              href={`/?stage=${s.key}#pipeline-board`}
              className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                stageFilter === s.key
                  ? "bg-slate-900 text-white"
                  : "bg-amber-100 text-amber-700 hover:bg-amber-200"
              }`}
            >
              {s.label} {s.missing}
            </Link>
          ))}
          {incompleteCounts.length === 0 && <span className="text-xs text-slate-300">全部個案各階段皆已完成</span>}
          {activeStage && (
            <Link href="/#pipeline-board" className="whitespace-nowrap text-xs text-slate-400 underline">
              清除篩選
            </Link>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-4 py-2 font-medium">研究編號</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">進度</th>
                {PIPELINE_STAGES.map((s) => (
                  <th key={s.key} className="whitespace-nowrap px-2 py-2 text-center font-medium" title={s.en}>
                    {s.label}
                  </th>
                ))}
                <th className="whitespace-nowrap px-4 py-2 font-medium">下次到期 / 待辦</th>
              </tr>
            </thead>
            <tbody>
              {pipeline.map((row) => (
                <tr key={row.case_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2">
                    <Link href={`/cases/${row.case_id}`} className="font-medium text-slate-900 underline">
                      {row.research_id}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="relative h-2 w-20 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className={`absolute left-0 top-0 h-full rounded-full ${progressTone(row.progress_pct)}`}
                          style={{ width: `${row.progress_pct}%` }}
                        />
                      </span>
                      <span className="tabular-nums text-xs text-slate-500">{row.progress_pct}%</span>
                    </div>
                  </td>
                  {PIPELINE_STAGES.map((s) => {
                    const dot = (
                      <span
                        className={row[s.key] ? "text-emerald-500" : "text-slate-300"}
                        title={`${s.label}：${row[s.key] ? "已完成" : "未完成"}`}
                      >
                        {row[s.key] ? "●" : "○"}
                      </span>
                    );
                    return (
                      <td key={s.key} className="whitespace-nowrap px-2 py-2 text-center">
                        {s.anchor ? (
                          <Link href={`/cases/${row.case_id}#${s.anchor}`} className="hover:opacity-70">
                            {dot}
                          </Link>
                        ) : (
                          dot
                        )}
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap px-4 py-2 text-xs">
                    <div className="flex items-center gap-1">
                      {row.next_due_date && <span className="text-slate-500">{row.next_due_date}</span>}
                      {row.overdue_count > 0 && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">逾期 {row.overdue_count}</span>
                      )}
                      {row.pending_fields > 0 && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
                          待補 {row.pending_fields}
                        </span>
                      )}
                      {!row.next_due_date && row.overdue_count === 0 && row.pending_fields === 0 && (
                        <span className="text-slate-300">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {pipeline.length === 0 && (
                <tr>
                  <td colSpan={3 + PIPELINE_STAGES.length} className="whitespace-nowrap px-4 py-6 text-center text-slate-400">
                    {activeStage ? "沒有符合篩選條件的個案" : "尚無個案"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 世代分佈 */}
      <section id="section-cohort" data-nav-section data-nav-label="世代分佈" className="scroll-mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">依醫師 By doctor</h2>
          <BarList rows={byDoctor} />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">依收案年份 By year</h2>
          <BarList rows={byYear} />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">依部位 By body site</h2>
          <BarList rows={bySite} />
        </div>
      </section>
    </div>
  );
}
