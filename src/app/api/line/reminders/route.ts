import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { collectDueReminders } from "@/lib/line";
import { assertRelaySecret } from "../_auth";

// GAS 的每日排程呼叫這裡拿「今天該推誰」，推完再用 POST 回報結果。
// 平台不主動連 LINE，也不需要 Vercel Cron。
//
// GET  /api/line/reminders?date=YYYY-MM-DD  → { date, reminders: [...] }
// POST /api/line/reminders                  → 記錄推播結果（含失敗），寫進 line_reminder_log

export async function GET(request: NextRequest) {
  const denied = assertRelaySecret(request);
  if (denied) return denied;

  // 日期由 GAS 帶（GAS 的時區設成 Asia/Taipei），沒帶時用伺服器的今天（Vercel 是 UTC，可能差一天）
  const date = request.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date 格式需為 YYYY-MM-DD" }, { status: 400 });
  }

  const supabase = supabaseServer();
  const reminders = await collectDueReminders(supabase, date);

  // 回傳給 GAS 的內容刻意只有 lineUserId 與訊息文字，不含研究編號以外的識別資訊；
  // researchId 保留是為了讓推播紀錄能對回個案（GAS 不會把它寫進訊息）。
  return NextResponse.json({ date, count: reminders.length, reminders });
}

type AckItem = {
  kind: "visit" | "radiotherapy";
  caseId: string;
  refId: string;
  dueDate: string;
  leadDays?: number;
  lineUserId?: string;
  message?: string;
  status?: "sent" | "failed";
  error?: string;
};

export async function POST(request: NextRequest) {
  const denied = assertRelaySecret(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { results?: AckItem[] } | null;
  const results = body?.results ?? [];
  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json({ recorded: 0 });
  }

  const supabase = supabaseServer();
  const rows = results
    .filter((r) => r.caseId && r.refId && r.dueDate && (r.kind === "visit" || r.kind === "radiotherapy"))
    .map((r) => ({
      case_id: r.caseId,
      kind: r.kind,
      ref_id: r.refId,
      due_date: r.dueDate,
      line_user_id: r.lineUserId ?? null,
      message: r.message ?? null,
      lead_days: typeof r.leadDays === "number" ? r.leadDays : 0,
      status: r.status === "failed" ? "failed" : "sent",
      error: r.error ?? null,
    }));

  // 唯一索引只擋 status='sent'，所以失敗的可以留多筆重試紀錄；
  // 重複回報同一筆成功推播會被索引擋下，這正是「重跑不會重複推」的保證。
  let recorded = 0;
  for (const row of rows) {
    const { error } = await supabase.from("line_reminder_log").insert(row);
    if (!error) recorded++;
  }

  return NextResponse.json({ recorded, received: rows.length });
}
