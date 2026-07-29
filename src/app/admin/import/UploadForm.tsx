"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

// 上傳走 fetch → /api/admin/import/upload（Route Handler），不用 Server Action：
// Server Action 的請求本體預設上限 1MB，舊資料 Excel 動輒超過。
export default function UploadForm() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [piiHeaders, setPiiHeaders] = useState<string[]>([]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPiiHeaders([]);
    setUploading(true);
    try {
      const res = await fetch("/api/admin/import/upload", {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      const data = await res.json().catch(() => ({ error: "伺服器回應無法解析" }));
      if (!res.ok) {
        setError(data.error ?? "上傳失敗");
        setPiiHeaders(data.piiHeaders ?? []);
        return;
      }
      router.push(`/admin/import/${data.batchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上傳失敗");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-brand-100 bg-white p-4">
      <div>
        <label className="block text-xs font-medium text-ink/60">選擇檔案（.csv / .xlsx / .xlsm）</label>
        {/* 不設 accept：Android 的檔案選擇器依系統認定的 MIME type 過濾而非副檔名，
            同一個 .csv/.xlsx 因來源不同會被標成 octet-stream 等而變灰選不到。
            副檔名與內容格式由伺服器端解析時驗證。 */}
        <input
          type="file"
          name="file"
          required
          className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
        />
        <p className="mt-1 text-xs text-ink/40">
          檔案必須已去識別化：只含研究編號，不得含病歷號、姓名、生日等個資欄位（偵測到會整份擋下）。
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-xs font-medium text-ink/60">表頭在第幾列</label>
          <input
            type="number"
            name="header_row"
            defaultValue={1}
            min={1}
            className="mt-1 w-24 rounded-md border border-brand-200 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-ink/60">工作表名稱（Excel 選填，留空取第一張）</label>
          <input
            name="sheet_name"
            placeholder="例：raw data (update 20230912)"
            className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
          {piiHeaders.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {piiHeaders.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Button type="submit" pending={uploading} pendingText="解析中…">
        上傳並進入欄位對應
      </Button>
    </form>
  );
}
