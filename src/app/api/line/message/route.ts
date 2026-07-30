import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { askGeminiWithKb } from "@/lib/gemini";
import {
  extractBindCode,
  extractKbTopic,
  extractKbCategory,
  isKbMenuRequest,
  kbCategoryOf,
  kbMenuQuickReplies,
  kbTopicQuickReplies,
  withKbMenuHint,
} from "@/lib/line";
import { loadLineTemplates } from "@/lib/lineTemplates";
import { logBotFailure } from "@/lib/botLog";
import { assertRelaySecret } from "../_auth";

// GAS 收到 LINE 的文字訊息後轉來這裡，平台判斷這是「綁定碼」還是「衛教提問」，
// 回傳一段文字讓 GAS 用 Messaging API 回覆。平台不碰 LINE 憑證。
//
// 回覆內容一律不含研究編號、部位、病歷號等可識別資訊——LINE 訊息可能被家人看到。
export async function POST(request: NextRequest) {
  const denied = assertRelaySecret(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { lineUserId?: string; text?: string } | null;
  const lineUserId = (body?.lineUserId ?? "").trim();
  const text = (body?.text ?? "").trim();

  if (!lineUserId) return NextResponse.json({ error: "缺少 lineUserId" }, { status: 400 });

  const supabase = supabaseServer();
  // 所有對外文案都走後台可維護的樣板（/admin/line-messages），撈不到就回退程式裡的預設值。
  const t = await loadLineTemplates(supabase);

  if (!text) return NextResponse.json({ reply: t.text("bind.empty_text") });

  const code = extractBindCode(text);

  // ① 綁定碼
  if (code) {
    const { data: target } = await supabase
      .from("cases")
      .select("id, research_id, line_bind_code_expires_at, line_bound")
      .eq("line_bind_code", code)
      .maybeSingle();

    if (!target) {
      return NextResponse.json({ reply: t.text("bind.code_invalid") });
    }
    if (target.line_bind_code_expires_at && new Date(target.line_bind_code_expires_at) < new Date()) {
      return NextResponse.json({ reply: t.text("bind.code_expired") });
    }

    // 這支 LINE 帳號已經綁在別的個案上（line_user_id 有唯一索引，直接寫會撞）
    const { data: existing } = await supabase
      .from("cases")
      .select("id")
      .eq("line_user_id", lineUserId)
      .maybeSingle();
    if (existing && existing.id !== target.id) {
      return NextResponse.json({ reply: t.text("bind.already_bound") });
    }

    const { error } = await supabase
      .from("cases")
      .update({
        line_user_id: lineUserId,
        line_bound: true,
        line_bound_at: new Date().toISOString(),
        line_bind_code: null,
        line_bind_code_expires_at: null,
      })
      .eq("id", target.id);
    if (error) {
      return NextResponse.json({ reply: t.text("bind.failed") }, { status: 200 });
    }

    await logAudit({
      caseId: target.id,
      operatorName: "LINE 綁定（病人操作）",
      action: "line_bind",
      entity: "cases",
      entityId: target.id,
    });

    return NextResponse.json({ reply: t.text("bind.success"), bound: true });
  }

  // ② 其餘一律當衛教提問。刻意不帶入任何個案資料——
  //    決策 2026-07-26：不用免費層做個人化諮詢，機器人只依後台衛教資料庫回答。
  const { data: kbRows } = await supabase
    .from("health_education_kb")
    .select("id, topic, content, category, pdf_url, video_url")
    .eq("active", true)
    .order("sort_order")
    // sort_order 沒特別設定時全是同一個值，只靠它排序 Postgres 不保證順序，
    // 會導致「哪幾則排進按鈕列」每次不一樣。加這個 tiebreaker 讓順序穩定可預期。
    .order("created_at");
  const kbEntries = kbRows ?? [];

  // 訊息下方一律附上按鈕，長輩不必打字也能瀏覽衛教（Quick Reply，2026-07-29）。
  // 內容超過一則訊息裝得下的量時，自動改成「分類 → 主題」兩層（2026-07-30）。
  const menu = kbMenuQuickReplies(kbEntries, t);

  // ②-a 病人點了主題按鈕：直接回那一則，不必再問 Gemini（省一次呼叫也不會答錯則）
  const topic = extractKbTopic(text);
  if (topic) {
    const entry = kbEntries.find((e) => e.topic === topic);
    if (entry) {
      let reply = `【${entry.topic}】\n${entry.content}`;
      if (entry.video_url?.trim()) reply += `\n\n🎬 衛教影片：\n${entry.video_url.trim()}`;
      if (entry.pdf_url?.trim()) reply += `\n\n📄 醫院衛教單張：\n${entry.pdf_url.trim()}`;
      // 看完一則之後留在同一分類，病人可以一路往下看；單層模式就直接給全部主題。
      const quickReply = menu.grouped
        ? kbTopicQuickReplies(kbEntries, kbCategoryOf(entry, t), true, t)
        : menu.items;
      return NextResponse.json({ reply: withKbMenuHint(reply, t), kind: "kb_topic", quickReply });
    }
  }

  // ②-b 病人點了分類按鈕：列出該分類底下的主題（第二層）
  const category = extractKbCategory(text);
  if (category) {
    const items = kbTopicQuickReplies(kbEntries, category, true, t);
    // items 末尾那顆是返回鈕，長度 1 代表這個分類其實沒有主題（分類剛被改名等情況），
    // 這時不要回一個空選單，往下當一般提問處理。
    if (items.length > 1) {
      return NextResponse.json({
        reply: t.text("menu.prompt.category", { category }),
        kind: "kb_category",
        quickReply: items,
      });
    }
  }

  // ②-c 病人輸入「衛教」「選單」等關鍵字：只給選單，不呼叫 Gemini
  if (isKbMenuRequest(text, t)) {
    return NextResponse.json({
      reply:
        kbEntries.length === 0
          ? t.text("menu.empty")
          : t.text(menu.grouped ? "menu.prompt.grouped" : "menu.prompt.single"),
      kind: "kb_menu",
      quickReply: menu.items,
    });
  }

  // ②-d 自由提問
  const result = await askGeminiWithKb(text, kbEntries, t);
  // 失敗留痕，否則額度爆掉時只會看到每個提問都回同一句、查不出原因（後台「LINE 紀錄」頁看得到）
  if (result.failure) await logBotFailure(supabase, result.failure, "line");
  return NextResponse.json({
    reply: withKbMenuHint(result.answer, t),
    kind: result.failure?.stage === "gemini_match" ? "kb_error" : "kb",
    quickReply: menu.items,
  });
}
