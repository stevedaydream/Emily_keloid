"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import {
  getConfiguredHandle,
  requestHandlePermission,
  readAllRows,
  appendMappingRow,
  type MrnMappingRow,
} from "@/lib/localMrnStore";

// 上傳前的去識別化：範本有 Name 與 Chart No. 兩欄，助理填表時很難不順手填。
//
// 這裡在**瀏覽器裡**先把那兩欄拆下來寫進本機對照表，再把清空後的檔案送到伺服器——
// 病歷號與姓名因此從不以明文離開這台電腦（決策 #1 的紅線）。
// 伺服器端還有第二道防線：偵測到那兩欄有值就整份擋掉。

type Phase = "idle" | "reading" | "stripping" | "uploading" | "done" | "error";

type Extracted = { research_id: string; name: string; mrn: string };

export default function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [linked, setLinked] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<string[]>([]);

  useEffect(() => {
    void getConfiguredHandle()
      .then((h) => setLinked(!!h))
      .catch(() => setLinked(false));
  }, []);

  async function run() {
    if (!file) return;
    setMessage(null);
    setDetail([]);
    try {
      setPhase("reading");
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());

      setPhase("stripping");
      const MAIN = ["Basic Info.", "Operation", "Year 1 follow-up", "Year 2 follow-up"];
      const found = new Map<string, Extracted>();
      let cleared = 0;

      for (const sheetName of MAIN) {
        const ws = wb.getWorksheet(sheetName);
        if (!ws) continue;
        const header = (ws.getRow(2).values as unknown[]).map((v) => String(v ?? "").trim());
        const idCol = header.indexOf("Subject_ID");
        const nameCol = header.indexOf("Name");
        const mrnCol = header.indexOf("Chart No.");
        if (idCol < 0) continue;

        for (let r = 3; r <= ws.rowCount; r++) {
          const row = ws.getRow(r);
          const rid = String(row.getCell(idCol).value ?? "").trim();
          if (!rid) continue;
          const name = nameCol > 0 ? String(row.getCell(nameCol).value ?? "").trim() : "";
          const mrn = mrnCol > 0 ? String(row.getCell(mrnCol).value ?? "").trim() : "";
          if (name || mrn) {
            const prev = found.get(rid) ?? { research_id: rid, name: "", mrn: "" };
            found.set(rid, { research_id: rid, name: name || prev.name, mrn: mrn || prev.mrn });
            if (nameCol > 0) row.getCell(nameCol).value = null;
            if (mrnCol > 0) row.getCell(mrnCol).value = null;
            cleared++;
          }
        }
      }

      // 有拆到姓名/病歷號就寫進本機對照表（沒掛對照表就擋下來，否則那些資料會直接消失）
      if (found.size > 0) {
        const handle = await getConfiguredHandle();
        if (!handle) {
          throw new Error(
            `檔案裡有 ${found.size} 位病人填了姓名或病歷號，但這台電腦還沒掛上本機對照表。` +
              `請先到「後台管理 → 病歷號對照設定」選擇對照表檔案，否則那些資料會在上傳時被丟掉。`
          );
        }
        const ok = await requestHandlePermission(handle);
        if (!ok) throw new Error("本機對照表的存取權限被拒絕");

        const existing = await readAllRows(handle);
        const known = new Map(existing.map((r) => [r.research_id.trim(), r]));
        const added: string[] = [];
        for (const e of found.values()) {
          if (known.has(e.research_id)) continue; // 已經有對應就不重複寫
          const row: MrnMappingRow = {
            mrn: e.mrn,
            research_id: e.research_id,
            case_id: "", // 個案還沒建立，匯入完成後可在對照表頁補
            created_at: new Date().toISOString(),
            name: e.name,
          };
          await appendMappingRow(handle, row);
          added.push(e.research_id);
        }
        setDetail([
          `已從檔案中取出 ${found.size} 位病人的姓名／病歷號並清空那兩欄（共 ${cleared} 格）`,
          added.length
            ? `其中 ${added.length} 筆是新的，已寫進本機對照表`
            : "這些研究編號在本機對照表裡都已存在，沒有重複寫入",
        ]);
      }

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
        檔案裡若填了 <code>Name</code> 或 <code>Chart No.</code>，會先在<b>你的瀏覽器裡</b>取出寫進本機對照表、
        並把那兩欄清空後才上傳——姓名與病歷號不會離開這台電腦。
      </p>

      {!linked && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          這台電腦尚未掛上本機對照表。若你的檔案有填姓名/病歷號，請先到
          「後台管理 → 病歷號對照設定」選擇對照表檔案；若兩欄都留空則可直接上傳。
        </p>
      )}

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
