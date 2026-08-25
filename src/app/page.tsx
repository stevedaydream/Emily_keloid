import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { PIPELINE_STAGES, stageAnchor, type CasePipelineRow, progressTone } from "@/lib/pipeline";
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
          <span className="w-32 shrink-0 truncate text-ink/60" title={r.label}>
            {r.label}
          </span>
          <span className="relative h-4 flex-1 overflow-hidden rounded bg-brand-50">
            <span
              className="absolute left-0 top-0 h-full rounded bg-brand-500"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </span>
          <span className="w-8 shrink-0 text-right font-data text-ink/50">{r.value}</span>
        </li>
      ))}
      {rows.length === 0 && <li className="text-sm text-ink/40">尚無資料</li>}
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
      <div className="text-xs text-ink/50">{label}</div>
      <div className="mt-1 font-data text-2xl font-medium text-brand-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink/40">{hint}</div>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="block rounded-lg border border-brand-100 bg-paper-raised p-4 hover:border-brand-300 hover:bg-brand-50/40">
        {content}
      </Link>
    );
  }
  return <div className="rounded-lg border border-brand-100 bg-paper-raised p-4">{content}</div>;
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
  searchParams: Promise<{ stage?: string; sort?: string; doctor?: string }>;
}) {
  const { stage: stageFilter, sort: sortKey, doctor: doctorFilter } = await searchParams;
  const supabase = supabaseServer();

  const [{ data: statsRow }, { data: pipelineRaw }, { data: casesRaw }, { data: doctorList }] = await Promise.all([
    supabase.from("v_dashboard_stats").select("*").single(),
    supabase.from("v_case_pipeline_progress").select("*").order("progress_pct", { ascending: true }),
    supabase.from("cases").select("id, research_id, enrollment_year, body_site, data_source, consent_signed_at, created_at, doctors(code, name)"),
    supabase.from("doctors").select("id, code, name").eq("active", true).order("code"),
  ]);

  const stats = (statsRow ?? {}) as Partial<DashboardStats>;
  const allPipeline = (pipelineRaw ?? []) as CasePipelineRow[];
  const cases = casesRaw ?? [];

  const incompleteCounts = PIPELINE_STAGES.map((s) => ({
    ...s,
    missing: allPipeline.filter((row) => !row[s.key]).length,
  })).filter((s) => s.missing > 0);

  // 看板的篩選與排序（2026-08-13）：原本固定「依完成度由低到高」，
  // 但要找特定一位病人時完成度排序反而難找，所以加上依研究編號排序與依醫師篩選。
  const activeStage = PIPELINE_STAGES.find((s) => s.key === stageFilter);
  let pipeline = activeStage ? allPipeline.filter((row) => !row[activeStage.key]) : allPipeline;
  if (doctorFilter) pipeline = pipeline.filter((row) => row.doctor_id === doctorFilter);
  if (sortKey === "research_id") {
    // 研究編號是 [醫師代碼]-[年份]-[流水序號]，流水序號是數字——直接字串比會讓 10 排在 2 前面，
    // 所以拆開後年份與流水各自用數值比較。
    const parts = (rid: string) => {
      const m = String(rid).match(/^(.*?)-(\d+)-(\d+)$/);
      return m ? { code: m[1], year: Number(m[2]), seq: Number(m[3]) } : { code: String(rid), year: 0, seq: 0 };
    };
    pipeline = [...pipeline].sort((a, x) => {
      const pa = parts(a.research_id), px = parts(x.research_id);
      return pa.code.localeCompare(px.code) || pa.year - px.year || pa.seq - px.seq;
    });
  }
  const keepParams = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { stage: stageFilter, sort: sortKey, doctor: doctorFilter, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const qs = q.toString();
    return `/${qs ? `?${qs}` : ""}#pipeline-board`;
  };

  const byDoctor = countBy(cases, (c) => {
    const d = Array.isArray(c.doctors) ? c.doctors[0] : c.doctors;
    return d ? `${d.code} ${d.name}` : null;
  });
  const byYear = countBy(cases, (c) => (c.enrollment_year ? String(c.enrollment_year) : null)).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  const bySite = countBy(cases, (c) => c.body_site);
  const currentYear = new Date().getFullYear();

  // 已收案、同意書未簽（決策 2026-08-20 F-C2）。實務上病人先在平板填完才補簽，
  // 所以這張清單是常態工作名單；匯出預設也會把這些個案排除在外。
  const unconsented = cases
    .filter((c) => !c.consent_signed_at)
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-xl font-medium text-brand-900">統計儀表板 Dashboard</h1>
        <Link href="/cases" className="text-sm text-brand-700 hover:underline">
          個案列表 →
        </Link>
      </div>

      <CaseSearchBox redirectTo="/cases" />

      {unconsented.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            已收案、同意書未簽
            <span className="ml-2 font-data text-xs font-normal text-amber-700">{unconsented.length} 位</span>
          </h2>
          <p className="mt-1 text-xs text-amber-800/70">
            這些個案的問卷與檢體資料在研究上尚不可用，<b>匯出時預設會被排除</b>。補上同意書日期後就會自動納入。
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {unconsented.slice(0, 30).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/cases/${c.id}#section-consent`}
                  className="whitespace-nowrap rounded-md border border-amber-300 bg-white px-2 py-1 font-data text-xs text-amber-900 hover:bg-amber-100"
                >
                  {c.research_id}
                </Link>
              </li>
            ))}
            {unconsented.length > 30 && (
              <li className="self-center text-xs text-amber-800/60">…另有 {unconsented.length - 30} 位</li>
            )}
          </ul>
        </section>
      )}

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
      <section id="pipeline-board" data-nav-section data-nav-label="收案一條龍進度看板" className="scroll-mt-4 rounded-lg border border-brand-100 bg-paper-raised">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-100 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="whitespace-nowrap text-sm font-semibold text-brand-900">收案一條龍進度看板</h2>
            <InfoTooltip text="點下方階段標籤可篩選出「該階段尚未完成」的個案；表頭上的●/○也可以點擊直接跳到該個案對應的區塊。" />
          </div>
          <span className="whitespace-nowrap text-xs text-ink/40">
            {sortKey === "research_id" ? "依研究編號排序" : "依完成度由低到高排序，優先處理落後個案"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-brand-50 px-4 py-2">
          <span className="whitespace-nowrap text-xs text-ink/40">依階段篩選未完成：</span>
          {incompleteCounts.map((s) => (
            <Link
              key={s.key}
              href={keepParams({ stage: s.key })}
              className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                stageFilter === s.key
                  ? "bg-brand-700 text-white"
                  : "bg-accent-100 text-accent-800 hover:bg-accent-200"
              }`}
            >
              {s.label} {s.missing}
            </Link>
          ))}
          {incompleteCounts.length === 0 && <span className="text-xs text-ink/30">全部個案各階段皆已完成</span>}
          {activeStage && (
            <Link href={keepParams({ stage: undefined })} className="whitespace-nowrap text-xs text-brand-700 underline">
              清除階段篩選
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-brand-50 px-4 py-2">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="whitespace-nowrap text-xs text-ink/40">排序：</span>
            {[
              { key: undefined, label: "完成度" },
              { key: "research_id", label: "研究編號" },
            ].map((o) => (
              <Link
                key={o.label}
                href={keepParams({ sort: o.key })}
                className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                  (sortKey ?? undefined) === o.key ? "bg-brand-700 text-white" : "bg-brand-50 text-brand-800 hover:bg-brand-100"
                }`}
              >
                {o.label}
              </Link>
            ))}
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="whitespace-nowrap text-xs text-ink/40">醫師：</span>
            <Link
              href={keepParams({ doctor: undefined })}
              className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                !doctorFilter ? "bg-brand-700 text-white" : "bg-brand-50 text-brand-800 hover:bg-brand-100"
              }`}
            >
              全部
            </Link>
            {(doctorList ?? []).map((d) => (
              <Link
                key={d.id}
                href={keepParams({ doctor: d.id })}
                className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                  doctorFilter === d.id ? "bg-brand-700 text-white" : "bg-brand-50 text-brand-800 hover:bg-brand-100"
                }`}
              >
                {d.name}
              </Link>
            ))}
          </span>
          <span className="whitespace-nowrap text-xs text-ink/30">顯示 {pipeline.length} 筆</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-brand-100 bg-brand-50/60 text-left text-ink/50">
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
                <tr key={row.case_id} className="border-b border-brand-50 last:border-0 hover:bg-brand-50/40">
                  <td className="whitespace-nowrap px-4 py-2">
                    <Link href={`/cases/${row.case_id}`} className="font-medium text-brand-800 underline">
                      {row.research_id}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="relative h-2 w-20 overflow-hidden rounded-full bg-brand-50">
                        <span
                          className={`absolute left-0 top-0 h-full rounded-full ${progressTone(row.progress_pct)}`}
                          style={{ width: `${row.progress_pct}%` }}
                        />
                      </span>
                      <span className="font-data text-xs text-ink/50">{row.progress_pct}%</span>
                    </div>
                  </td>
                  {PIPELINE_STAGES.map((s) => {
                    const inProgress = s.key === "step_followup" && row.step_followup_status === "in_progress";
                    const dot = (
                      <span
                        className={row[s.key] ? "text-brand-500" : inProgress ? "text-accent-500" : "text-ink/20"}
                        title={`${s.label}：${row[s.key] ? "已完成" : inProgress ? "進行中" : "未完成"}`}
                      >
                        {row[s.key] ? "●" : inProgress ? "◐" : "○"}
                      </span>
                    );
                    // 「資料完整」的落點依個案來源而不同（回溯建檔才有欄位盤點區塊），見 stageAnchor()
                    const anchor = stageAnchor(s, row);
                    return (
                      <td key={s.key} className="whitespace-nowrap px-2 py-2 text-center">
                        {anchor ? (
                          <Link href={`/cases/${row.case_id}#${anchor}`} className="hover:opacity-70">
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
                      {row.next_due_date && <span className="text-ink/50">{row.next_due_date}</span>}
                      {row.overdue_count > 0 && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">逾期 {row.overdue_count}</span>
                      )}
                      {row.pending_fields > 0 && (
                        <span className="rounded bg-accent-100 px-1.5 py-0.5 text-accent-800">
                          待補 {row.pending_fields}
                        </span>
                      )}
                      {!row.next_due_date && row.overdue_count === 0 && row.pending_fields === 0 && (
                        <span className="text-ink/20">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {pipeline.length === 0 && (
                <tr>
                  <td colSpan={3 + PIPELINE_STAGES.length} className="whitespace-nowrap px-4 py-6 text-center text-ink/40">
                    {activeStage || doctorFilter ? "沒有符合篩選條件的個案" : "尚無個案"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 世代分佈 */}
      <section id="section-cohort" data-nav-section data-nav-label="世代分佈" className="scroll-mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-brand-100 bg-paper-raised p-4">
          <h2 className="mb-3 text-sm font-semibold text-brand-900">依醫師 By doctor</h2>
          <BarList rows={byDoctor} />
        </div>
        <div className="rounded-lg border border-brand-100 bg-paper-raised p-4">
          <h2 className="mb-3 text-sm font-semibold text-brand-900">依收案年份 By year</h2>
          <BarList rows={byYear} />
        </div>
        <div className="rounded-lg border border-brand-100 bg-paper-raised p-4">
          <h2 className="mb-3 text-sm font-semibold text-brand-900">依部位 By body site</h2>
          <BarList rows={bySite} />
        </div>
      </section>
    </div>
  );
}
