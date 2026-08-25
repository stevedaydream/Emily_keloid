"use server";

import { revalidatePath } from "next/cache";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";
import { setExportKey, verifyExportKey, verifyExportRecoveryCode } from "@/lib/exportKey";

async function operatorOrThrow() {
  const op = await getCurrentOperator();
  if (!op) throw new Error("未選擇操作者");
  return op;
}

function keyIssue(key: string): string | null {
  if (key.length < 8) return "金鑰至少要 8 個字元";
  if (/^\d+$/.test(key)) return "不要只用數字，請混合英文字母或符號";
  return null;
}

/**
 * 設定或更換匯出金鑰。
 *
 * - 第一次設定：不需要舊金鑰。
 * - 已經設定過：必須提供**舊金鑰**或**救援碼**其中之一，否則任何登入者都能把金鑰換掉，
 *   那這道門就形同虛設。
 *
 * 回傳新的救援碼——只有這一次拿得到，平台只留雜湊。
 */
export async function setExportKeyAction(input: {
  newKey: string;
  confirmKey: string;
  currentKey?: string;
  recoveryCode?: string;
  alreadySet: boolean;
}): Promise<{ recoveryCode: string }> {
  const operator = await operatorOrThrow();

  if (input.newKey !== input.confirmKey) throw new Error("兩次輸入的金鑰不一致");
  const issue = keyIssue(input.newKey);
  if (issue) throw new Error(issue);

  if (input.alreadySet) {
    const okByKey = input.currentKey ? await verifyExportKey(input.currentKey) : false;
    const okByCode = input.recoveryCode ? await verifyExportRecoveryCode(input.recoveryCode) : false;
    if (!okByKey && !okByCode) {
      throw new Error("舊金鑰或救援碼不正確——要更換金鑰必須先證明你有其中之一");
    }
  }

  const { recoveryCode } = await setExportKey(input.newKey, operator);
  await logAudit({
    operatorName: operator,
    action: input.alreadySet ? "export_key_reset" : "export_key_set",
    entity: "app_settings",
  });
  revalidatePath("/admin/export-key");
  return { recoveryCode };
}
