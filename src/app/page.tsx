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
    .select("id, case_id, label, due_date, status, actions, questionnaire_id, cases(research_id, body_site)")
    .eq("status", "pending")
    .order("due_date", { ascending: true })
    .limit(10);

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
        <h2 className="mb-2 text-sm font-semibold text-slate-700">快速前往待處理項目</h2>
        <p className="mb-2 text-xs text-slate-400">
          點選下方任一待處理時程項目的連結，直接開啟填問卷/拍照頁面，不需先進個案頁面。
        </p>
        <ul className="space-y-1">
          {(dueSoon ?? []).map((item) => {
            const c = Array.isArray(item.cases) ? item.cases[0] : item.cases;
            const actions: string[] = item.actions ?? [];
            return (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{c?.research_id}</span>
                  <span className="ml-1 text-slate-400">（{c?.body_site ?? "—"}）</span> — {item.label}（到期日 {item.due_date}）
                </span>
                <span className="flex items-center gap-3">
                  {actions.includes("questionnaire") &&
                    (item.questionnaire_id ? (
                      <Link href={`/patient/${item.case_id}/questionnaire/${item.id}`} className="text-xs text-blue-600 underline">
                        測試填問卷
                      </Link>
                    ) : (
                      <span className="text-xs text-red-400">（未指定問卷）</span>
                    ))}
                  {actions.includes("photo") && (
                    <Link href={`/patient/${item.case_id}/photo/${item.id}`} className="text-xs text-blue-600 underline">
                      測試拍照
                    </Link>
                  )}
                  <Link href={`/cases/${item.case_id}`} className="text-xs text-slate-400 underline">
                    看個案
                  </Link>
                </span>
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
