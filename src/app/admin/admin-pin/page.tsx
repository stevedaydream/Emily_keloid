import { adminPinIsSet, canUseMaintenanceTools } from "@/lib/adminPin";

import AdminPinPanel from "./AdminPinPanel";

export default async function AdminPinPage() {
  const [alreadySet, gate] = await Promise.all([adminPinIsSet(), canUseMaintenanceTools()]);

  if (!gate.ok) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="font-heading text-xl font-medium text-brand-900">系統管理者 PIN</h1>
        <div className="rounded-lg border-2 border-amber-200 bg-amber-50/60 p-4 text-sm">
          <p className="font-medium text-amber-900">
            {gate.reason === "need_pin" ? "需要重新輸入系統管理者 PIN" : "這一頁是給系統管理者用的"}
          </p>
          <p className="mt-1 text-xs text-ink/60">
            目前狀態：<b>{alreadySet ? "已設定 PIN" : "未設定"}</b>。要設定或更換請以「系統管理者」身分進入。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="font-heading text-xl font-medium text-brand-900">系統管理者 PIN</h1>
        <p className="mt-1 text-sm text-ink/50">
          設定後，切換成「系統管理者」這個操作者要先輸入 PIN——維運工具（測試模式、清除測試個案、匯出金鑰）
          一鍵就會影響全站資料，不該讓拿到共用帳號的人隨手點到。
        </p>
      </div>
      <AdminPinPanel alreadySet={alreadySet} />
    </div>
  );
}
