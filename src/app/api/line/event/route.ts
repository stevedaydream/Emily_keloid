import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { loadLineTemplates } from "@/lib/lineTemplates";
import { assertRelaySecret } from "../_auth";

// 加好友 / 封鎖等非訊息事件。
// unfollow（病人封鎖或刪除官方帳號）要解除綁定，否則之後推播會一直失敗，
// 而且那個 line_user_id 會卡住唯一索引、讓病人換手機後綁不回來。
export async function POST(request: NextRequest) {
  const denied = assertRelaySecret(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { type?: string; lineUserId?: string } | null;
  const type = (body?.type ?? "").trim();
  const lineUserId = (body?.lineUserId ?? "").trim();
  if (!lineUserId) return NextResponse.json({ error: "缺少 lineUserId" }, { status: 400 });

  const supabase = supabaseServer();

  if (type === "unfollow") {
    const { data: target } = await supabase
      .from("cases")
      .select("id")
      .eq("line_user_id", lineUserId)
      .maybeSingle();

    if (target) {
      await supabase
        .from("cases")
        .update({ line_bound: false, line_user_id: null, line_bound_at: null })
        .eq("id", target.id);
      await logAudit({
        caseId: target.id,
        operatorName: "LINE 解除綁定（病人封鎖）",
        action: "line_unbind",
        entity: "cases",
        entityId: target.id,
      });
    }
    return NextResponse.json({ ok: true, unbound: !!target });
  }

  if (type === "follow") {
    // 剛加好友還不知道是誰，給一段引導；綁定要等他送出綁定碼（或掃 QR 預填後送出）
    const t = await loadLineTemplates(supabase);
    return NextResponse.json({ reply: t.text("bind.welcome") });
  }

  return NextResponse.json({ ok: true, ignored: type });
}
