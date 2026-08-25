"use server";

import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";

// 這兩支 action 只搬運密文。伺服器端沒有通行碼、也沒有任何解密邏輯，
// 因此就算有人在這裡加 console.log 也印不出病歷號（見 lib/mrnVault.ts 的說明）。

export interface VaultPayload {
  ciphertext: string;
  iv: string;
  row_count: number;
  /** 1=舊格式（通行碼直接加密內容）；2=雙金鑰（DEK 分別被通行碼與救援碼包住） */
  format?: number;
  /** v1 專用：通行碼導出金鑰的參數。v2 改放進 wraps，兩份各有自己一組。 */
  salt?: string | null;
  iterations?: number | null;
  /** v2 專用：{ passphrase: {...}, recovery: {...} }。裡面只有被包住的 DEK，沒有任何祕密本身。 */
  wraps?: unknown;
}

export async function loadVaultAction(): Promise<(VaultPayload & { updated_at: string; updated_by: string | null }) | null> {
  const supabase = supabaseServer();
  const { data } = await supabase
    .from("mrn_vault")
    .select("ciphertext, salt, iv, iterations, row_count, format, wraps, updated_at, updated_by")
    .eq("id", "default")
    .maybeSingle();
  return data ?? null;
}

export async function saveVaultAction(payload: VaultPayload): Promise<{ ok: boolean; message: string }> {
  // 基本形狀檢查：確保存進去的真的是密文欄位，而不是誰誤傳了明文。
  // v2 沒有頂層 salt（每份 wrap 各有自己的），改檢查 wraps 兩份都在。
  if (!payload?.ciphertext || !payload.iv) {
    return { ok: false, message: "保管庫內容不完整，未寫入" };
  }
  if (payload.format === 2) {
    const w = payload.wraps as { passphrase?: unknown; recovery?: unknown } | null;
    if (!w?.passphrase || !w?.recovery) {
      return { ok: false, message: "保管庫缺少通行碼或救援碼的金鑰包，未寫入" };
    }
  } else if (!payload.salt) {
    return { ok: false, message: "保管庫內容不完整，未寫入" };
  }

  const operator = (await getCurrentOperator()) ?? "未知操作者";
  const supabase = supabaseServer();

  const { error } = await supabase.from("mrn_vault").upsert(
    {
      id: "default",
      ciphertext: payload.ciphertext,
      salt: payload.salt ?? null,
      iv: payload.iv,
      iterations: payload.iterations ?? null,
      row_count: payload.row_count,
      format: payload.format ?? 1,
      wraps: payload.wraps ?? null,
      updated_at: new Date().toISOString(),
      updated_by: operator,
    },
    { onConflict: "id" }
  );
  if (error) return { ok: false, message: `寫入失敗：${error.message}` };

  // 自動備份（決策 2026-08-20）：每次寫入留一份版本快照，只保留最近 30 份。
  // 平板收案之後 mrn_vault 是病歷號對照的唯一來源，覆蓋錯或損毀就再也還原不回來。
  // 備份失敗不擋主流程——主要的那份已經寫進去了，這裡失敗只是少一層保險。
  try {
    await supabase.from("mrn_vault_versions").insert({
      ciphertext: payload.ciphertext,
      salt: payload.salt ?? null,
      iv: payload.iv,
      iterations: payload.iterations ?? null,
      row_count: payload.row_count,
      format: payload.format ?? 1,
      wraps: payload.wraps ?? null,
      created_by: operator,
    });
    const { data: keep } = await supabase
      .from("mrn_vault_versions")
      .select("id")
      .order("created_at", { ascending: false })
      .range(30, 1000);
    if (keep && keep.length > 0) {
      await supabase.from("mrn_vault_versions").delete().in("id", keep.map((k) => k.id));
    }
  } catch {
    // 忽略：備份是額外保險，不該讓它擋下已經成功的主寫入
  }

  // 稽核只記「誰在什麼時候更新了保管庫、幾筆」，不含任何對照內容。
  await logAudit({
    operatorName: operator,
    action: "update_mrn_vault",
    entity: "mrn_vault",
    detail: { rowCount: payload.row_count },
  });

  return { ok: true, message: `已加密上傳 ${payload.row_count} 筆對照` };
}
