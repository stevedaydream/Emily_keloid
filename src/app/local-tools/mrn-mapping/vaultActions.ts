"use server";

import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";

// 這兩支 action 只搬運密文。伺服器端沒有通行碼、也沒有任何解密邏輯，
// 因此就算有人在這裡加 console.log 也印不出病歷號（見 lib/mrnVault.ts 的說明）。

export interface VaultPayload {
  ciphertext: string;
  salt: string;
  iv: string;
  iterations: number;
  row_count: number;
}

export async function loadVaultAction(): Promise<(VaultPayload & { updated_at: string; updated_by: string | null }) | null> {
  const supabase = supabaseServer();
  const { data } = await supabase
    .from("mrn_vault")
    .select("ciphertext, salt, iv, iterations, row_count, updated_at, updated_by")
    .eq("id", "default")
    .maybeSingle();
  return data ?? null;
}

export async function saveVaultAction(payload: VaultPayload): Promise<{ ok: boolean; message: string }> {
  // 基本形狀檢查：確保存進去的真的是密文欄位，而不是誰誤傳了明文。
  if (!payload?.ciphertext || !payload.salt || !payload.iv) {
    return { ok: false, message: "保管庫內容不完整，未寫入" };
  }

  const operator = (await getCurrentOperator()) ?? "未知操作者";
  const supabase = supabaseServer();

  const { error } = await supabase.from("mrn_vault").upsert(
    {
      id: "default",
      ciphertext: payload.ciphertext,
      salt: payload.salt,
      iv: payload.iv,
      iterations: payload.iterations,
      row_count: payload.row_count,
      updated_at: new Date().toISOString(),
      updated_by: operator,
    },
    { onConflict: "id" }
  );
  if (error) return { ok: false, message: `寫入失敗：${error.message}` };

  // 稽核只記「誰在什麼時候更新了保管庫、幾筆」，不含任何對照內容。
  await logAudit({
    operatorName: operator,
    action: "update_mrn_vault",
    entity: "mrn_vault",
    detail: { rowCount: payload.row_count },
  });

  return { ok: true, message: `已加密上傳 ${payload.row_count} 筆對照` };
}
