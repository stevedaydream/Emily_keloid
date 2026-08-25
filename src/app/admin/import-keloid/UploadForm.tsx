"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

// 範本有 Name 與 Chart No. 兩欄。2026-08-25 起這兩欄直接匯入 cases.mrn / cases.patient_name——
// 原本要在瀏覽器裡先拆下來寫本機對照表、再上傳清空後的檔案（決策 #1），那套已廢除。

type Phase = "idle" | "reading" | "stripping" | "uploading" | "done" | "error";

export default function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<string[]>([]);

  async function run() {
    if (!file) return;
    setMessage(null);
    setDetail([]);
    try {
      setPhase("reading");
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());

      // 2026-08-25：不再把 Name／Chart No. 兩欄拆下來寫本機對照表。
      // 病歷號與姓名現在直接存進 cases.mrn / cases.patient_name（廢除本機對照表與保管庫），
      // 所以檔案原樣上傳即可，解析時那兩欄會跟著進資料庫。
      setPhase("uploading");
      const cleanBuffer = await wb.xlsx.writeBuffer();
      const form = new FormData();
      form.append("file", new File([cleanBuffer], file.name, { type: file.type }));
      const res = await fetch("/api/admin/import-keloid/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `上傳失敗（${res.status}）`);

      setPhase("done");
      setMessage(`已暫存 ${json.cases} 位病人（${json.blocked} 筆有錯誤無法匯入、${json.needsReview} 筆需人工確認）`);
      router.push(`/admin/import-keloid/${json.batchId}`);
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "處理失敗");
    }
  }

  const busy = phase === "reading" || phase === "stripping" || phase === "uploading";
  const busyText = phase === "reading" ? "讀取檔案…" : phase === "stripping" ? "拆出姓名/病歷號…" : "上傳中…";

  return (
    <div className="rounded-lg border border-brand-100 bg-paper-raised p-4">
      <h2 className="text-sm font-semibold text-brand-900">上傳填好的範本</h2>
      <p className="mt-1 text-xs text-ink/50">
        只接受用「下載空白範本」取得的格式（4 張工作表、欄名不可更動）。
        <code>Name</code> 與 <code>Chart No.</code> 會一起匯入（存進個案的姓名與病歷號欄位）；
        匯出時預設不會帶出這兩欄，需要金鑰才行。
      </p>

      <input
        type="file"
        accept=".xlsx"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="mt-3 block w-full text-sm"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={!file} pending={busy} pendingText={busyText}>
          解析並暫存
        </Button>
        <a href="/api/export/import-template" className="text-xs text-brand-700 underline">
          下載空白範本
        </a>
      </div>

      {detail.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs text-emerald-700">
          {detail.map((d, i) => (
            <li key={i}>・{d}</li>
          ))}
        </ul>
      )}
      {message && (
        <p className={`mt-2 whitespace-pre-line text-xs ${phase === "error" ? "text-red-600" : "text-emerald-700"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
