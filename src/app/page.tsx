import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";

export default async function HomePage() {
  const supabase = supabaseServer();
  const { data: cases } = await supabase
    .from("cases")
    .select(
      "id, research_id, body_site, consent_signed_at, data_source, line_bound, created_at, doctors(code, name)"
    )
    .order("created_at", { ascending: false });

  const { data: dueSoon } = await supabase
    .from("case_schedule_items")
    .select("case_id, label, due_date, status, cases(research_id)")
    .eq("status", "pending")
    .order("due_date", { ascending: true })
    .limit(5);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">個案列表</h1>
        <Link
          href="/cases/new"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
        >
          + 新增個案
        </Link>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">研究編號</th>
              <th className="px-4 py-2 font-medium">醫師</th>
              <th className="px-4 py-2 font-medium">部位</th>
              <th className="px-4 py-2 font-medium">同意書</th>
              <th className="px-4 py-2 font-medium">LINE 綁定</th>
              <th className="px-4 py-2 font-medium">來源</th>
            </tr>
          </thead>
          <tbody>
            {(cases ?? []).map((c) => {
              const doctor = Array.isArray(c.doctors) ? c.doctors[0] : c.doctors;
              return (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/cases/${c.id}`} className="font-medium text-slate-900 underline">
                      {c.research_id}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {doctor?.code} {doctor?.name}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{c.body_site ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {c.consent_signed_at ? `已簽署 ${c.consent_signed_at}` : "未簽署"}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{c.line_bound ? "已綁定" : "未綁定"}</td>
                  <td className="px-4 py-2">
                    {c.data_source === "legacy_import" ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
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
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  尚無個案，請先新增
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">近期待處理時程</h2>
        <ul className="space-y-1">
          {(dueSoon ?? []).map((item, i) => {
            const c = Array.isArray(item.cases) ? item.cases[0] : item.cases;
            return (
              <li key={i} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="font-medium">{c?.research_id}</span> — {item.label}（到期日 {item.due_date}）
              </li>
            );
          })}
          {(!dueSoon || dueSoon.length === 0) && (
            <li className="text-sm text-slate-400">目前沒有待處理的時程項目</li>
          )}
        </ul>
      </section>
    </div>
  );
}
