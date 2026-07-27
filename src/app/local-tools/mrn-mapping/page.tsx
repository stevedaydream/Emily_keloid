"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  isFileSystemAccessSupported,
  getConfiguredHandle,
  pickMappingFile,
  requestHandlePermission,
  readAllRows,
  appendMappingRow,
  type MrnMappingRow,
} from "@/lib/localMrnStore";
import { lookupCaseIdByResearchId } from "./actions";

export default function MrnMappingPage() {
  const [supported, setSupported] = useState(true);
  const [handle, setHandle] = useState<FileSystemFileHandle | null>(null);
  const [rows, setRows] = useState<MrnMappingRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newMrn, setNewMrn] = useState("");
  const [newResearchId, setNewResearchId] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setSupported(isFileSystemAccessSupported());
    getConfiguredHandle().then((h) => {
      setHandle(h);
      if (h) void reload(h);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reload(h: FileSystemFileHandle) {
    setLoading(true);
    setError(null);
    try {
      const ok = await requestHandlePermission(h);
      if (!ok) throw new Error("本機檔案存取權限被拒絕");
      setRows(await readAllRows(h));
    } catch (err) {
      setError(err instanceof Error ? err.message : "讀取本機對照表失敗");
    } finally {
      setLoading(false);
    }
  }

  async function handleChooseFile() {
    try {
      const h = await pickMappingFile();
      setHandle(h);
      await reload(h);
    } catch {
      // 使用者取消選擇視窗
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!handle) return;
    const mrn = newMrn.trim();
    const researchId = newResearchId.trim();
    if (!mrn || !researchId) return;
    setAdding(true);
    setError(null);
    try {
      const ok = await requestHandlePermission(handle);
      if (!ok) throw new Error("本機檔案存取權限被拒絕");
      const caseId = await lookupCaseIdByResearchId(researchId);
      await appendMappingRow(handle, {
        mrn,
        research_id: researchId,
        case_id: caseId ?? "",
        created_at: new Date().toISOString(),
      });
      setNewMrn("");
      setNewResearchId("");
      await reload(handle);
      if (!caseId) setError(`已新增對照，但找不到研究編號「${researchId}」對應的個案（可能是拼字問題或個案尚未建立）`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增失敗");
    } finally {
      setAdding(false);
    }
  }

  const filtered = q.trim()
    ? rows.filter(
        (r) =>
          r.mrn.toLowerCase().includes(q.trim().toLowerCase()) ||
          r.research_id.toLowerCase().includes(q.trim().toLowerCase())
      )
    : rows;

  if (!supported) {
    return (
      <div className="max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        此瀏覽器不支援本機檔案存取功能（File System Access API），請改用 Chrome 或 Edge 開啟這一頁。
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">病歷號對照維護</h1>
        <p className="mt-1 text-sm text-slate-500">
          病歷號只存在你選定的本機檔案裡，這一頁的所有讀寫都在瀏覽器本機完成，不會送到平台伺服器。新增個案時如果有填病歷號，也會自動寫入同一份檔案。
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white p-3 text-sm">
        <span className="text-slate-600">{handle ? "已連結本機對照表檔案" : "尚未設定本機對照表檔案"}</span>
        <div className="flex gap-2">
          {handle && (
            <button
              type="button"
              onClick={() => reload(handle)}
              disabled={loading}
              className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "讀取中…" : "重新載入"}
            </button>
          )}
          <button
            type="button"
            onClick={handleChooseFile}
            className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
          >
            {handle ? "更換對照表位置" : "選擇對照表位置"}
          </button>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {handle && (
        <>
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 rounded-md border border-slate-200 bg-white p-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">病歷號</label>
              <input
                value={newMrn}
                onChange={(e) => setNewMrn(e.target.value)}
                className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">研究編號</label>
              <input
                value={newResearchId}
                onChange={(e) => setNewResearchId(e.target.value)}
                placeholder="例如 CHN-2026-001"
                className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={adding}
              className="whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {adding ? "新增中…" : "新增對照"}
            </button>
            <span className="text-xs text-slate-400">用於補登舊資料或平台外建立的個案</span>
          </form>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋病歷號或研究編號"
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:w-80"
          />

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">病歷號</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">研究編號</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">建立時間</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">個案</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={`${r.mrn}-${i}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-900">{r.mrn}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-600">{r.research_id}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-400">
                      {r.created_at ? new Date(r.created_at).toLocaleString("zh-TW") : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      {r.case_id ? (
                        <Link href={`/cases/${r.case_id}`} className="text-xs text-blue-600 underline">
                          查看個案
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="whitespace-nowrap px-4 py-6 text-center text-slate-400">
                      {rows.length === 0 ? "對照表尚無資料" : "沒有符合搜尋的資料"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
