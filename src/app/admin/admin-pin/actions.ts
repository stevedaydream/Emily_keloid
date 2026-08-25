"use server";

import { revalidatePath } from "next/cache";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";
import { adminPinIsSet, clearAdminPin, setAdminPin, verifyAdminPin } from "@/lib/adminPin";

export type AdminPinResult = { ok: true; message: string } | { ok: false; error: string };

// ⚠️ 驗證結果一律用回傳值，不要 throw——Next 在正式環境會把 server action 丟出的訊息抹掉
// （踩過三次：createCaseAction 撞號、匯出金鑰、收案問診選項互斥）。

async function operatorOrFail(): Promise<string | null> {
  return (await getCurrentOperator()) ?? null;
}

function pinIssue(pin: string): string | null {
  if (!/^\d{4,8}$/.test(pin)) return "PIN 請輸入 4-8 位數字";
  if (/^(\d)\1+$/.test(pin)) return "不要用同一個數字重複（例如 0000）";
  return null;
}

/** 設定或更換 PIN。已設定過就必須先輸入舊 PIN，否則這道門形同虛設。 */
export async function setAdminPinAction(input: {
  newPin: string;
  confirmPin: string;
  currentPin?: string;
}): Promise<AdminPinResult> {
  const operator = await operatorOrFail();
  if (!operator) return { ok: false, error: "未選擇操作者" };

  if (input.newPin !== input.confirmPin) return { ok: false, error: "兩次輸入的 PIN 不一致" };
  const issue = pinIssue(input.newPin);
  if (issue) return { ok: false, error: issue };

  if (await adminPinIsSet()) {
    if (!(await verifyAdminPin(input.currentPin ?? ""))) return { ok: false, error: "目前的 PIN 不正確" };
  }

  await setAdminPin(input.newPin, operator);
  await logAudit({ operatorName: operator, action: "admin_pin_set", entity: "app_settings" });
  revalidatePath("/admin/admin-pin");
  return { ok: true, message: "已設定。下次切換成系統管理者時會要求輸入這組 PIN。" };
}

/** 取消 PIN（回到不擋的狀態）。同樣要先證明你知道現在這組。 */
export async function clearAdminPinAction(input: { currentPin: string }): Promise<AdminPinResult> {
  const operator = await operatorOrFail();
  if (!operator) return { ok: false, error: "未選擇操作者" };
  if (!(await adminPinIsSet())) return { ok: false, error: "目前沒有設定 PIN" };
  if (!(await verifyAdminPin(input.currentPin))) return { ok: false, error: "目前的 PIN 不正確" };

  await clearAdminPin(operator);
  await logAudit({ operatorName: operator, action: "admin_pin_clear", entity: "app_settings" });
  revalidatePath("/admin/admin-pin");
  return { ok: true, message: "已取消。任何人都能直接切換成系統管理者。" };
}
