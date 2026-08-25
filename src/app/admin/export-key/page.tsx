import { exportKeyIsSet } from "@/lib/exportKey";
import { canUseMaintenanceTools } from "@/lib/adminPin";
import ExportKeyPanel from "./ExportKeyPanel";

export default async function ExportKeyAdminPage() {
  const [alreadySet, gate] = await Promise.all([exportKeyIsSet(), canUseMaintenanceTools()]);

  // 換金鑰＝改變「誰匯得出病歷號與姓名」，跟測試模式同一道門（系統管理者＋PIN）。
  if (!gate.ok) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="font-heading text-xl font-medium text-brand-900">匯出金鑰</h1>
        <div className="rounded-lg border-2 border-amber-200 bg-amber-50/60 p-4 text-sm">
          <p className="font-medium text-amber-900">
            {gate.reason === "need_pin" ? "需要重新輸入系統管理者 PIN" : "這一頁是給系統管理者用的"}
          </p>
          <p className="mt-1 text-xs text-ink/60">
            目前狀態：<b>{alreadySet ? "已設定金鑰" : "尚未設定"}</b>。
            {gate.reason === "need_pin"
              ? "請回到操作者選單重新選一次「系統管理者」並輸入 PIN。"
              : "要設定或更換金鑰，請切換到「系統管理者」操作者。"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="font-heading text-xl font-medium text-brand-900">匯出金鑰</h1>
        <p className="mt-1 text-sm text-ink/50">
          控制「匯出檔裡要不要帶病歷號與姓名」。沒有金鑰時，匯出的 Name / Chart No. 兩欄一律是空的。
        </p>
      </div>
      <ExportKeyPanel alreadySet={alreadySet} />
    </div>
  );
}
