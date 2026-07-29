import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { askGeminiWithKb } from "@/lib/gemini";
import { extractBindCode, kbQuickReplies, extractKbTopic, isKbMenuRequest } from "@/lib/line";
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
  if (!text) return NextResponse.json({ reply: "請直接輸入您的問題，或輸入診間提供的綁定碼完成綁定。" });

  const supabase = supabaseServer();
  const code = extractBindCode(text);

  // ① 綁定碼
  if (code) {
    const { data: target } = await supabase
      .from("cases")
      .select("id, research_id, line_bind_code_expires_at, line_bound")
      .eq("line_bind_code", code)
      .maybeSingle();

    if (!target) {
      return NextResponse.json({ reply: "綁定碼不正確，請確認診間提供的內容，或請診間重新產生一組。" });
    }
    if (target.line_bind_code_expires_at && new Date(target.line_bind_code_expires_at) < new Date()) {
      return NextResponse.json({ reply: "這組綁定碼已逾期，請洽診間重新產生。" });
    }

    // 這支 LINE 帳號已經綁在別的個案上（line_user_id 有唯一索引，直接寫會撞）
    const { data: existing } = await supabase
      .from("cases")
      .select("id")
      .eq("line_user_id", lineUserId)
      .maybeSingle();
    if (existing && existing.id !== target.id) {
      return NextResponse.json({
        reply: "這個 LINE 帳號已經完成過綁定。若需要更換，請洽診間協助解除後再重新綁定。",
      });
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
      return NextResponse.json({ reply: "綁定時發生問題，請稍後再試或洽診間協助。" }, { status: 200 });
    }

    await logAudit({
      caseId: target.id,
      operatorName: "LINE 綁定（病人操作）",
      action: "line_bind",
      entity: "cases",
      entityId: target.id,
    });

    return NextResponse.json({
      reply: [
        "綁定完成！",
        "之後回診與放射治療的提醒會透過這裡通知您。",
        "",
        "您也可以直接輸入問題詢問傷口照顧相關的衛教內容。",
      ].join("\n"),
      bound: true,
    });
  }

  // ② 其餘一律當衛教提問。刻意不帶入任何個案資料——
  //    決策 2026-07-26：不用免費層做個人化諮詢，機器人只依後台衛教資料庫回答。
  const { data: kbRows } = await supabase
    .from("health_education_kb")
    .select("id, topic, content, category, pdf_url, video_url")
    .eq("active", true)
    .order("sort_order");
  const kbEntries = kbRows ?? [];

  // 訊息下方一律附上主題按鈕，長輩不必打字也能瀏覽衛教（Quick Reply，2026-07-29）
  const quickReply = kbQuickReplies(kbEntries);

  // ②-a 病人點了主題按鈕：直接回那一則，不必再問 Gemini（省一次呼叫也不會答錯則）
  const topic = extractKbTopic(text);
  if (topic) {
    const entry = kbEntries.find((e) => e.topic === topic);
    if (entry) {
      let reply = `【${entry.topic}】\n${entry.content}`;
      if (entry.video_url?.trim()) reply += `\n\n🎬 衛教影片：\n${entry.video_url.trim()}`;
      if (entry.pdf_url?.trim()) reply += `\n\n📄 醫院衛教單張：\n${entry.pdf_url.trim()}`;
      return NextResponse.json({ reply, kind: "kb_topic", quickReply });
    }
  }

  // ②-b 病人輸入「衛教」「選單」等關鍵字：只給選單，不呼叫 Gemini
  if (isKbMenuRequest(text)) {
    return NextResponse.json({
      reply:
        kbEntries.length > 0
          ? "請點選您想了解的主題，或直接輸入問題："
          : "目前尚無衛教內容，請洽詢診間人員。",
      kind: "kb_menu",
      quickReply,
    });
  }

  // ②-c 自由提問
  const result = await askGeminiWithKb(text, kbEntries);
  return NextResponse.json({ reply: result.answer, kind: "kb", quickReply });
}
