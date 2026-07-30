import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";

// LINE 推播與機器人錯誤的紀錄頁。
// 在這頁出現之前，line_reminder_log 只有寫入、沒有任何地方讀，推播失敗完全是靜默的
// （病人沒收到、診間也不知道）。這頁的唯一目的就是「壞掉的時候看得見」。

const RECENT_LIMIT = 100;

type ReminderRow = {
  id: string;
  case_id: string;
  kind: string;
  due_date: string;
  lead_days: number;
  status: string;
  error: string | null;
  sent_at: string;
  message: string | null;
};

type ErrorRow = {
  id: string;
  occurred_at: string;
  stage: string;
  reason: string;
  source: string;
};

const KIND_LABEL: Record<string, string> = { visit: "回診", radiotherapy: "放療" };
const STAGE_LABEL: Record<string, string> = {
  gemini_match: "主題比對（病人收到「暫時無法回答」）",
  gemini_rewrite: "語氣改寫（病人收到衛教原文，資訊仍正確）",
};
const SOURCE_LABEL: Record<string, string> = { line: "LINE", kb_chat: "示範對話頁" };

function fmt(ts: string): string {
  return ts.slice(0, 16).replace("T", " ");
}

/** 近 30 天的起點，用來算「最近的失敗多不多」。 */
function thirtyDaysAgoIso(nowIso: string): string {
  const d = new Date(nowIso);
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString();
}

export default async function LineLogsAdminPage() {
  const supabase = supabaseServer();
  const nowIso = new Date().toISOString();
  const since = thirtyDaysAgoIso(nowIso);

  const [{ data: reminderData }, { data: errorData }, { data: caseData }] = await Promise.all([
    supabase
      .from("line_reminder_log")
      .select("id, case_id, kind, due_date, lead_days, status, error, sent_at, message")
      .order("sent_at", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from("line_bot_error_log")
      .select("id, occurred_at, stage, reason, source")
      .order("occurred_at", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase.from("cases").select("id, research_id"),
  ]);

  const reminders = (reminderData ?? []) as ReminderRow[];
  const errors = (errorData ?? []) as ErrorRow[];
  const researchIdById = new Map((caseData ?? []).map((c) => [c.id as string, c.research_id as string]));

  const failedReminders = reminders.filter((r) => r.status === "failed");
  const sentLast30 = reminders.filter((r) => r.status === "sent" && r.sent_at >= since).length;
  const matchErrors = errors.filter((e) => e.stage === "gemini_match").length;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-heading text-xl font-medium text-brand-900">LINE 推播與錯誤紀錄</h1>
        <p className="mt-1 text-sm text-ink/50">
          最近 {RECENT_LIMIT} 筆。推播失敗與機器人錯誤在這裡才看得見——病人端不會有任何提示，
          診間也不會收到通知，所以請定期看一眼。文案設定在{" "}
          <Link href="/admin/line-messages" className="text-brand-700 underline">
            LINE 機器人回覆設定
          </Link>
          。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-brand-100 bg-paper-raised p-3">
          <div className="text-xs text-ink/50">近 30 天成功推播</div>
          <div className="font-data text-2xl text-brand-800">{sentLast30}</div>
          <div className="mt-0.5 text-xs text-ink/40">每則佔用 LINE 官方帳號月額度</div>
        </div>
        <div
          className={`rounded-lg border p-3 ${
            failedReminders.length > 0 ? "border-amber-300 bg-amber-50" : "border-brand-100 bg-paper-raised"
          }`}
        >
          <div className="text-xs text-ink/50">推播失敗</div>
          <div className={`font-data text-2xl ${failedReminders.length > 0 ? "text-amber-800" : "text-brand-800"}`}>
            {failedReminders.length}
          </div>
          <div className="mt-0.5 text-xs text-ink/40">當天那則隔天會自動重試</div>
        </div>
        <div
          className={`rounded-lg border p-3 ${
            matchErrors > 0 ? "border-amber-300 bg-amber-50" : "border-brand-100 bg-paper-raised"
          }`}
        >
          <div className="text-xs text-ink/50">機器人無法回答</div>
          <div className={`font-data text-2xl ${matchErrors > 0 ? "text-amber-800" : "text-brand-800"}`}>
            {matchErrors}
          </div>
          <div className="mt-0.5 text-xs text-ink/40">多半是 Gemini 免費層額度用完</div>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="font-heading text-base font-medium text-brand-800">推播紀錄</h2>
        <div className="overflow-x-auto rounded-lg border border-brand-100 bg-paper-raised">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-brand-50/50 text-xs text-ink/55">
              <tr>
                <th className="px-3 py-2 text-left font-medium">推播時間</th>
                <th className="px-3 py-2 text-left font-medium">研究編號</th>
                <th className="px-3 py-2 text-left font-medium">類型</th>
                <th className="px-3 py-2 text-left font-medium">到期日</th>
                <th className="px-3 py-2 text-left font-medium">狀態</th>
                <th className="px-3 py-2 text-left font-medium">錯誤</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {reminders.map((r) => (
                <tr key={r.id} className={r.status === "failed" ? "bg-amber-50/60" : ""}>
                  <td className="whitespace-nowrap px-3 py-2 font-data text-xs text-ink/60">{fmt(r.sent_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-data text-xs">
                    {researchIdById.get(r.case_id) ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    {KIND_LABEL[r.kind] ?? r.kind}
                    {r.kind === "visit" && (
                      <span className="ml-1 text-ink/40">{r.lead_days > 0 ? `提前 ${r.lead_days} 天` : "當天"}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-data text-xs text-ink/60">{r.due_date}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    {r.status === "sent" ? (
                      <span className="text-brand-700">已送出</span>
                    ) : (
                      <span className="font-medium text-amber-800">失敗</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink/50">{r.error ?? ""}</td>
                </tr>
              ))}
              {reminders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-sm text-ink/40">
                    尚無推播紀錄
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink/40">
          同一個病人同一天的多則提醒會合併成一次推播（省額度），但紀錄仍是逐筆——所以同一時間可能出現多列、
          內容相同，那是正常的。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-heading text-base font-medium text-brand-800">機器人錯誤</h2>
        <div className="overflow-x-auto rounded-lg border border-brand-100 bg-paper-raised">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-brand-50/50 text-xs text-ink/55">
              <tr>
                <th className="px-3 py-2 text-left font-medium">時間</th>
                <th className="px-3 py-2 text-left font-medium">來源</th>
                <th className="px-3 py-2 text-left font-medium">階段</th>
                <th className="px-3 py-2 text-left font-medium">原因</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {errors.map((e) => (
                <tr key={e.id} className={e.stage === "gemini_match" ? "bg-amber-50/60" : ""}>
                  <td className="whitespace-nowrap px-3 py-2 font-data text-xs text-ink/60">{fmt(e.occurred_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-ink/60">
                    {SOURCE_LABEL[e.source] ?? e.source}
                  </td>
                  <td className="px-3 py-2 text-xs">{STAGE_LABEL[e.stage] ?? e.stage}</td>
                  <td className="px-3 py-2 font-data text-xs text-ink/50">{e.reason}</td>
                </tr>
              ))}
              {errors.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-sm text-ink/40">
                    尚無錯誤紀錄（機器人運作正常）
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink/40">
          出現大量 <code className="font-data">HTTP 429</code> 代表 Gemini 免費層額度用完或被限流；
          此時病人的自由提問會收到「暫時無法回答」，但<b>主題按鈕與選單完全不受影響</b>（那條路不經過 AI）。
          這裡不記錄病人問了什麼——病人可能自己打進姓名或病歷號，存下來會破壞去識別化前提。
        </p>
      </section>
    </div>
  );
}
