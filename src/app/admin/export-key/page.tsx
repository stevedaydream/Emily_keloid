import { exportKeyIsSet } from "@/lib/exportKey";
import ExportKeyPanel from "./ExportKeyPanel";

export default async function ExportKeyAdminPage() {
  const alreadySet = await exportKeyIsSet();
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
