import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import ClinicTodayList from "./ClinicTodayList";
import PatientName from "@/components/LocalNameProvider";

// 今日門診：自動撈出「今天到期或已逾期」的待辦時程項目所屬個案，
// 再讓助理把臨時回診、或沒有排時程的病人（例如 92 筆舊資料）手動加進來。
export default async function ClinicTodayPage() {
  const supabase = supabaseServer();
  const today = new Date().toISOString().slice(0, 10);

  const { data: items } = await supabase
    .from("case_schedule_items")
    .select("case_id, label, due_date")
    .eq("status", "pending")
    .lte("due_date", today)
    .order("due_date");

  const caseIds = [...new Set((items ?? []).map((i) => i.case_id))];
  const { data: cases } = caseIds.length
    ? await supabase.from("cases").select("id, research_id, patient_name").in("id", caseIds)
    : { data: [] };

  const researchIdById = new Map((cases ?? []).map((c) => [c.id, c.research_id]));
  const patientNameById = new Map((cases ?? []).map((c) => [c.id, c.patient_name]));

  // 搜尋用的完整個案清單一次送到瀏覽器（不到百筆、幾 KB），比對全部在前端做。
  // 2026-08-25 起姓名與病歷號就在這張表裡（不再是本機對照表），一起帶下來給前端比對。
  const { data: allCases } = await supabase
    .from("cases")
    .select("id, research_id, mrn, patient_name, body_site, enrollment_year, data_source, created_at, doctors(code, name)")
    .order("research_id");

  const searchable = (allCases ?? []).map((c) => {
    const doctor = Array.isArray(c.doctors) ? c.doctors[0] : c.doctors;
    return {
      caseId: c.id,
      researchId: c.research_id ?? "",
      mrn: c.mrn ?? "",
      patientName: c.patient_name ?? "",
      bodySite: c.body_site ?? "",
      enrollmentYear: c.enrollment_year ?? null,
      dataSource: c.data_source ?? "",
      doctor: doctor ? `${doctor.code} ${doctor.name}` : "",
    };
  });

  // 「已收案、未手術」（決策 2026-08-20 F-D6）：追蹤時程改成登記手術後才產生，
  // 所以術前這段病人一筆時程項目都沒有，不做這一區他們會完全不出現在今日門診上。
  // 這一區同時是工作名單也是異常偵測——收案條件是 RT＋手術，卡在術前太久本身就該有人看。
  const [{ data: postOpRows }, { data: preOpDraws }] = await Promise.all([
    supabase.from("case_schedule_items").select("case_id").eq("source", "post_op"),
    supabase.from("biobank_checklist_items").select("case_id, collected").eq("item_key", "blood_pre_op"),
  ]);
  const operatedCaseIds = new Set((postOpRows ?? []).map((r) => r.case_id));
  const preOpDrawDone = new Map((preOpDraws ?? []).map((d) => [d.case_id, d.collected === true]));

  const awaitingSurgery = (allCases ?? [])
    .filter((c) => !operatedCaseIds.has(c.id))
    .map((c) => ({
      caseId: c.id,
      researchId: c.research_id ?? "",
      patientName: c.patient_name ?? "",
      createdAt: c.created_at as string | null,
      // 用頁面上方已算好的 today 當基準，不在 render 裡再呼叫一次 Date.now()
      daysWaiting: c.created_at
        ? Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${String(c.created_at).slice(0, 10)}T00:00:00Z`)) / 86_400_000)
        : null,
      preOpBloodDone: preOpDrawDone.get(c.id) === true,
    }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  const auto = caseIds.map((id) => {
    const own = (items ?? []).filter((i) => i.case_id === id);
    const overdue = own.filter((i) => i.due_date < today).length;
    return {
      caseId: id,
      researchId: researchIdById.get(id) ?? "",
      patientName: patientNameById.get(id) ?? "",
      dueCount: own.length,
      overdueCount: overdue,
      earliestDue: own[0]?.due_date ?? "",
    };
  });

  return (
    <div className="space-y-4">
      {/* 收案是門診當下最常按的動作，放在最上面、做到不可能按錯（2026-08-20 使用者指定） */}
      <Link
        href="/intake"
        className="flex items-center justify-center gap-3 rounded-xl bg-brand-700 px-6 py-6 text-center text-xl font-medium text-white shadow-[0_10px_24px_-12px_rgba(27,35,24,0.55)] transition hover:bg-brand-800 sm:py-8 sm:text-2xl"
      >
        <span className="text-3xl leading-none">＋</span>
        收 案
      </Link>

      <div>
        <h1 className="font-heading text-xl font-medium text-brand-900">今日門診</h1>
        <p className="mt-1 text-sm text-ink/50">
          自動列出今天到期或已逾期的追蹤項目；臨時回診、或還沒有排時程的病人，用下方搜尋加進來即可。
          每位病人處理完就按該張卡片的「儲存這位病人」，不用等到最後。
        </p>
      </div>

      <ClinicTodayList auto={auto} today={today} searchable={searchable} />

      <section className="rounded-lg border border-brand-100 bg-paper-raised p-4">
        <h2 className="text-sm font-semibold text-ink/80">
          已收案、未手術
          <span className="ml-2 font-data text-xs font-normal text-ink/40">{awaitingSurgery.length} 位</span>
        </h2>
        <p className="mt-1 text-xs text-ink/40">
          追蹤時程在登記「手術切除」後才會以手術日為起點產生，所以這些病人還沒有到期項目。
          等刀期間的回診、打針、擦藥照常在個案頁登記。
        </p>
        <ul className="mt-2 space-y-1">
          {awaitingSurgery.map((c) => (
            <li
              key={c.caseId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-brand-50 px-3 py-1.5 text-sm"
            >
              <Link href={`/cases/${c.caseId}`} className="font-data text-brand-800 underline">
                {c.researchId}
              </Link>
              <PatientName name={c.patientName} className="text-ink/70" />
              {c.daysWaiting !== null && (
                <span className={`text-xs ${c.daysWaiting > 90 ? "text-amber-700" : "text-ink/40"}`}>
                  已收案 {c.daysWaiting} 天
                </span>
              )}
              <span
                className={`ml-auto whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                  c.preOpBloodDone ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
                title="第 1 次抽血（手術前 baseline）必須在手術前完成"
              >
                {c.preOpBloodDone ? "✓ 術前抽血已收" : "術前抽血待收"}
              </span>
            </li>
          ))}
          {awaitingSurgery.length === 0 && (
            <li className="rounded-md border border-dashed border-brand-200 p-3 text-center text-sm text-ink/40">
              目前沒有等待手術的個案
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
