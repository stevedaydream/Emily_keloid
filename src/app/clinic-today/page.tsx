import { supabaseServer } from "@/lib/supabase";
import ClinicTodayList from "./ClinicTodayList";

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
    ? await supabase.from("cases").select("id, research_id").in("id", caseIds)
    : { data: [] };

  const researchIdById = new Map((cases ?? []).map((c) => [c.id, c.research_id]));

  const auto = caseIds.map((id) => {
    const own = (items ?? []).filter((i) => i.case_id === id);
    const overdue = own.filter((i) => i.due_date < today).length;
    return {
      caseId: id,
      researchId: researchIdById.get(id) ?? "",
      dueCount: own.length,
      overdueCount: overdue,
      earliestDue: own[0]?.due_date ?? "",
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-xl font-medium text-brand-900">今日門診</h1>
        <p className="mt-1 text-sm text-ink/50">
          自動列出今天到期或已逾期的追蹤項目；臨時回診、或還沒有排時程的病人，用下方搜尋加進來即可。
          每位病人處理完就按該張卡片的「儲存這位病人」，不用等到最後。
        </p>
      </div>

      <ClinicTodayList auto={auto} today={today} />
    </div>
  );
}
