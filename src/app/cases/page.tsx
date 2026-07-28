import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import CaseSearchBox from "@/components/CaseSearchBox";
import PatientName from "@/components/LocalNameProvider";
import { buttonClasses } from "@/components/ui/buttonStyles";

const RECURRENCE_LABEL: Record<string, string> = {
  none: "無復發",
  recurred: "已復發",
  unknown: "未知",
  not_applicable: "不適用",
};

const FILTER_LABEL: Record<string, (v: string) => string> = {
  year: (v) => `收案年度：${v}`,
  source: (v) => `來源：${v === "legacy_import" ? "舊資料回溯建檔" : "正常收案"}`,
  consent: (v) => `同意書：${v === "signed" ? "已簽署" : "未簽署"}`,
  line: (v) => `LINE 綁定：${v === "bound" ? "已綁定" : "未綁定"}`,
  recurrence: (v) => `復發狀態：${RECURRENCE_LABEL[v] ?? v}`,
  overdue: () => "有逾期時程項目",
  q: (v) => `搜尋：${v}`,
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const supabase = supabaseServer();

  let query = supabase
    .from("cases")
    .select(
      "id, research_id, body_site, consent_signed_at, data_source, line_bound, enrollment_year, recurrence_status, created_at, doctors(code, name)"
    )
    .order("created_at", { ascending: false });

  if (sp.year) query = query.eq("enrollment_year", Number(sp.year));
  if (sp.source) query = query.eq("data_source", sp.source);
  if (sp.consent === "signed") query = query.not("consent_signed_at", "is", null);
  if (sp.consent === "unsigned") query = query.is("consent_signed_at", null);
  if (sp.line === "bound") query = query.eq("line_bound", true);
  if (sp.line === "unbound") query = query.eq("line_bound", false);
  if (sp.recurrence) query = query.eq("recurrence_status", sp.recurrence);

  if (sp.overdue === "true") {
    const { data: overdueRows } = await supabase
      .from("v_case_pipeline_progress")
      .select("case_id")
      .gt("overdue_count", 0);
    const ids = (overdueRows ?? []).map((r) => r.case_id);
    query = query.in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }

  const { data: casesRaw } = await query;

  const q = sp.q?.trim().toLowerCase();
  const cases = q
    ? (casesRaw ?? []).filter((c) => {
        const doctor = Array.isArray(c.doctors) ? c.doctors[0] : c.doctors;
        const haystack = [c.research_id, doctor?.code, doctor?.name, c.body_site].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(q);
      })
    : casesRaw ?? [];

  const activeFilters = Object.entries(sp).filter(([, v]) => v);

  const { data: dueSoon } = await supabase
    .from("case_schedule_items")
    .select("id, case_id, label, due_date, status, actions, questionnaire_id, cases(research_id, body_site)")
    .eq("status", "pending")
    .order("due_date", { ascending: true })
    .limit(10);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-xl font-medium text-brand-900">個案列表</h1>
        <Link href="/cases/new" className={buttonClasses("primary", "sm")}>
          + 新增個案
        </Link>
      </div>

      <CaseSearchBox defaultValue={sp.q ?? ""} redirectTo="/cases" />

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink/50">篩選中：</span>
          {activeFilters.map(([k, v]) => (
            <span key={k} className="whitespace-nowrap rounded bg-accent-100 px-2 py-0.5 text-xs text-accent-800">
              {FILTER_LABEL[k]?.(v as string) ?? `${k}=${v}`}
            </span>
          ))}
          <Link href="/cases" className="whitespace-nowrap text-xs text-brand-700 underline">
            清除篩選
          </Link>
        </div>
      )}

      <section className="overflow-x-auto rounded-lg border border-brand-100 bg-paper-raised">
        <table className="w-full text-sm">
          <thead className="border-b border-brand-100 bg-brand-50/60 text-left text-ink/50">
            <tr>
              <th className="whitespace-nowrap px-4 py-2 font-medium">研究編號</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">姓名</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">醫師</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">部位</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">同意書</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">LINE 綁定</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">來源</th>
            </tr>
          </thead>
          <tbody>
            {(cases ?? []).map((c) => {
              const doctor = Array.isArray(c.doctors) ? c.doctors[0] : c.doctors;
              return (
                <tr key={c.id} className="border-b border-brand-50 last:border-0 hover:bg-brand-50/40">
                  <td className="whitespace-nowrap px-4 py-2">
                    <Link href={`/cases/${c.id}`} className="font-medium text-brand-800 underline">
                      {c.research_id}
                    </Link>
                  </td>
                  {/* 姓名由瀏覽器端從本機對照表注入，伺服器渲染的內容不含姓名 */}
                  <td className="whitespace-nowrap px-4 py-2 text-ink/80">
                    <PatientName researchId={c.research_id} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-ink/70">
                    {doctor?.code} {doctor?.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-ink/70">{c.body_site ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-ink/70">
                    {c.consent_signed_at ? `已簽署 ${c.consent_signed_at}` : "未簽署"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-ink/70">{c.line_bound ? "已綁定" : "未綁定"}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {c.data_source === "legacy_import" ? (
                      <span className="rounded bg-accent-100 px-2 py-0.5 text-xs text-accent-800">
                        舊資料回溯建檔
                      </span>
                    ) : (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                        正常收案
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {(!cases || cases.length === 0) && (
              <tr>
                <td colSpan={7} className="whitespace-nowrap px-4 py-6 text-center text-ink/40">
                  沒有符合篩選條件的個案
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-brand-900">快速前往待處理項目</h2>
        <p className="mb-2 text-xs text-ink/40">
          點選下方任一待處理時程項目的連結，直接開啟填問卷/拍照頁面，不需先進個案頁面。
        </p>
        <ul className="space-y-1">
          {(dueSoon ?? []).map((item) => {
            const c = Array.isArray(item.cases) ? item.cases[0] : item.cases;
            const actions: string[] = item.actions ?? [];
            return (
              <li
                key={item.id}
                className="rounded-md border border-brand-100 bg-paper-raised px-3 py-2 text-sm"
              >
                <div className="flex flex-col gap-1.5">
                  <span className="break-words">
                    <span className="font-medium text-ink">{c?.research_id}</span>
                    <span className="ml-1 text-ink/40">（{c?.body_site ?? "—"}）</span> — {item.label}（到期日 {item.due_date}）
                  </span>
                  <div className="-mx-3 overflow-x-auto px-3">
                    <span className="flex w-max items-center gap-3 whitespace-nowrap">
                      {actions.includes("questionnaire") &&
                        (item.questionnaire_id ? (
                          <Link href={`/patient/${item.case_id}/questionnaire/${item.id}`} className="text-xs text-brand-700 underline">
                            測試填問卷
                          </Link>
                        ) : (
                          <span className="text-xs text-red-400">（未指定問卷）</span>
                        ))}
                      {actions.includes("photo") && (
                        <Link href={`/patient/${item.case_id}/photo/${item.id}`} className="text-xs text-brand-700 underline">
                          測試拍照
                        </Link>
                      )}
                      <Link href={`/cases/${item.case_id}`} className="text-xs text-ink/40 underline">
                        看個案
                      </Link>
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
          {(!dueSoon || dueSoon.length === 0) && (
            <li className="text-sm text-ink/40">目前沒有待處理的時程項目</li>
          )}
        </ul>
      </section>
    </div>
  );
}
