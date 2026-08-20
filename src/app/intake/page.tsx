import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import NewCaseForm from "@/app/cases/new/NewCaseForm";
import PatientName from "@/components/LocalNameProvider";
import { PATIENT_INTAKE_SEGMENTS } from "@/lib/patientIntake";

// 收案頁。2026-08-20 起這是全平台唯一的建檔入口（/cases/new 仍在，但已退出導覽列）。
// 跟 /cases/new 共用同一個表單元件，差別在 variant="intake"——建檔後留在原頁、
// 清空表單、焦點回病歷號，醫師欄不清空，右側「今日收案」可直接把平板交給病人。
export default async function IntakePage() {
  const supabase = supabaseServer();

  // 「今天」以伺服器所在時區的日期為準；台灣院內使用，Vercel 上是 UTC，
  // 所以用 Asia/Taipei 換算出當地日期再組出當天的 UTC 起訖，避免早上 8 點前的個案被算到昨天。
  const taipeiToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }); // YYYY-MM-DD
  const dayStart = new Date(`${taipeiToday}T00:00:00+08:00`).toISOString();
  const dayEnd = new Date(`${taipeiToday}T23:59:59.999+08:00`).toISOString();

  const [{ data: doctors }, { data: todayCases }] = await Promise.all([
    supabase.from("doctors").select("id, code, name").eq("active", true).order("code"),
    supabase
      .from("cases")
      .select("id, research_id, created_at, created_by, case_patient_intake_progress(segment_key)")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .order("created_at", { ascending: false }),
  ]);

  const totalSegments = PATIENT_INTAKE_SEGMENTS.length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <div>
          <h1 className="font-heading text-xl font-medium text-brand-900">收案</h1>
          <p className="mt-1 text-sm text-ink/50">
            研究編號自動產生。建立後會留在這一頁、表單清空，可以直接收下一位；
            接著把平板交給病人自填。病灶部位與尺寸在個案頁用人形圖登記。
          </p>
        </div>
        <NewCaseForm variant="intake" doctors={doctors ?? []} />
      </div>

      <aside className="space-y-2 lg:sticky lg:top-4 lg:self-start">
        <h2 className="text-sm font-semibold text-ink/70">
          今日收案
          <span className="ml-2 font-data text-xs font-normal text-ink/40">{(todayCases ?? []).length} 位</span>
        </h2>
        <ul className="space-y-2">
          {(todayCases ?? []).map((c) => {
            const done = (c.case_patient_intake_progress ?? []).length;
            return (
              <li key={c.id} className="rounded-lg border border-brand-100 bg-paper-raised p-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <b className="font-data text-sm text-brand-900">{c.research_id}</b>
                  <PatientName researchId={c.research_id} className="text-sm text-ink/70" />
                </div>
                <p className="mt-0.5 text-xs text-ink/40">
                  {new Date(c.created_at).toLocaleTimeString("zh-TW", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Taipei",
                  })}
                  {c.created_by && ` ・ ${c.created_by}`}
                </p>
                <p className="mt-1 text-xs">
                  {done === 0 ? (
                    <span className="text-ink/40">病人自填：尚未開始</span>
                  ) : done < totalSegments ? (
                    <span className="text-amber-700">
                      病人自填 {done}/{totalSegments} 段
                    </span>
                  ) : (
                    <span className="text-emerald-700">✓ 病人自填完成</span>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    href={`/patient/${c.id}/intake`}
                    className="whitespace-nowrap rounded-md bg-brand-700 px-2.5 py-1 text-xs text-white hover:bg-brand-800"
                  >
                    {done === 0 ? "交給病人填" : "繼續填"}
                  </Link>
                  <Link
                    href={`/cases/${c.id}`}
                    className="whitespace-nowrap rounded-md border border-brand-200 px-2.5 py-1 text-xs text-brand-800 hover:bg-brand-50"
                  >
                    開個案
                  </Link>
                </div>
              </li>
            );
          })}
          {(todayCases ?? []).length === 0 && (
            <li className="rounded-lg border border-dashed border-brand-200 p-4 text-center text-sm text-ink/40">
              今天還沒有收案
            </li>
          )}
        </ul>
      </aside>
    </div>
  );
}
