"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  isFileSystemAccessSupported,
  getConfiguredHandle,
  pickMappingFile,
  openExistingMappingFile,
  requestHandlePermission,
  readAllRows,
  readRowsFromFile,
  appendMappingRow,
  type MrnMappingRow,
} from "@/lib/localMrnStore";
import { useLocalNames } from "@/components/LocalNameProvider";
import { lookupCaseIdByResearchId } from "./actions";
import VaultPanel from "./VaultPanel";
import VaultRowsEditor from "./VaultRowsEditor";

export default function MrnMappingPage() {
  const { devMobileMapping, mountFromFile } = useLocalNames();
  const [supported, setSupported] = useState(true);
  // 開發逃生口掛上來的資料：唯讀、只在記憶體，重整就沒
  const [sessionRows, setSessionRows] = useState<MrnMappingRow[] | null>(null);
  const [handle, setHandle] = useState<FileSystemFileHandle | null>(null);
  const [rows, setRows] = useState<MrnMappingRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newMrn, setNewMrn] = useState("");
  const [newResearchId, setNewResearchId] = useState("");
  const [newName, setNewName] = useState("");
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

  // 已經有一份對照表 → 直接用開檔對話框選它（不會跳「要取代嗎」）
  async function handleOpenExisting() {
    try {
      const h = await openExistingMappingFile();
      setHandle(h);
      await reload(h);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return; // 使用者取消
      setError(err instanceof Error ? err.message : "開啟本機對照表失敗");
    }
  }

  // 還沒有對照表 → 用存檔對話框建立一份新的
  async function handleCreateNew() {
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
        name: newName.trim(),
      });
      setNewMrn("");
      setNewResearchId("");
      setNewName("");
      await reload(handle);
      if (!caseId) setError(`已新增對照，但找不到研究編號「${researchId}」對應的個案（可能是拼字問題或個案尚未建立）`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增失敗");
    } finally {
      setAdding(false);
    }
  }

  const filtered = q.trim()
    ? rows.filter((r) => {
        const needle = q.trim().toLowerCase();
        return (
          r.mrn.toLowerCase().includes(needle) ||
          r.research_id.toLowerCase().includes(needle) ||
          (r.name ?? "").toLowerCase().includes(needle)
        );
      })
    : rows;

  if (!supported) {
    return (
      <div className="max-w-xl space-y-4">
        {/* 開發逃生口：唯讀掛載，只給後台勾了 dev_mobile_mapping 的操作者 */}
        {devMobileMapping && (
          <div className="space-y-2 rounded-lg border border-sky-300 bg-sky-50 p-4 text-sm text-sky-900">
            <p className="font-medium">工程模式：唯讀掛載（僅此工作階段）</p>
            <p>
              選一份對照表 CSV，姓名就會顯示在各頁面，方便開發時對問題。
              <b>只讀不寫、不會存進這台裝置</b>，重新整理或關掉分頁就沒了，也無法新增對應。
            </p>
            {/* 不設 accept：Android 的檔案選擇器是依系統認定的 MIME type 過濾，不是看副檔名。
                同樣是 .csv，來源不同會被標成 application/vnd.ms-excel、application/octet-stream
                等等，設了 accept 就會整批變灰選不到。內容本來就由 readRowsFromFile 驗證。 */}
            <input
              type="file"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setError(null);
                try {
                  const total = await mountFromFile(file);
                  setSessionRows(await readRowsFromFile(file));
                  if (total === 0) setError("這份 CSV 沒有資料列（只有表頭或是空檔）");
                } catch (err) {
                  const detail = err instanceof Error ? err.message : "讀取 CSV 失敗";
                  setError(`${detail}（請確認選到的是對照表 CSV：${file.name}）`);
                }
              }}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-sky-600 file:px-3 file:py-2 file:text-white"
            />
            {sessionRows && (
              <p className="text-sky-800">
                ✓ 已讀入 {sessionRows.length} 筆，其中 {sessionRows.filter((r) => r.name?.trim()).length} 筆有姓名。
              </p>
            )}
            {error && <p className="text-red-700">{error}</p>}
            <p className="text-xs text-sky-700">
              這是開發用的旗標（`operators.dev_mobile_mapping`），正式收案前請到「操作者清單」全部關掉。
            </p>
          </div>
        )}

        {sessionRows && sessionRows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
            <table className="w-full min-w-max text-sm">
              <thead className="border-b border-brand-100 bg-brand-50/60 text-left text-xs text-ink/60">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">病歷號</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">姓名</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">研究編號</th>
                </tr>
              </thead>
              <tbody>
                {sessionRows.slice(0, 200).map((r, i) => (
                  <tr key={i} className="border-b border-brand-50 last:border-0">
                    <td className="whitespace-nowrap px-3 py-1.5 font-data">{r.mrn}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{r.name}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-data">{r.research_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 行動裝置掛不上本機檔案，但可以用通行碼解開雲端保管庫（密文才上雲端，見 lib/mrnVault.ts） */}
        <VaultPanel localRows={null} />

        {/* 解鎖後直接編輯保管庫：平板上這是唯一的維護面（決策 2026-08-20） */}
        <VaultRowsEditor />

        <div className="space-y-2 rounded-lg border border-brand-200 bg-paper-sunken p-4 text-sm text-ink/70">
          <p className="font-medium text-ink/80">這台裝置寫不了本機 CSV，改用雲端保管庫</p>
          <p>
            病歷號對照表原本是直接讀寫你電腦上的 CSV，用的是瀏覽器的 File System Access API。
            桌機版 Chrome / Edge 一直有，<b>Android Chrome 現在也有</b>；
            <b>這台裝置的瀏覽器沒有</b>（iPad 的 Safari 至今仍未實作），那不是權限沒開，是根本沒有這個功能。
          </p>
          <p>
            所以在這台裝置上，<b>雲端保管庫就是病歷號對照的來源</b>：用通行碼解鎖之後，
            上面可以新增／修改／刪除對照，收案時填的病歷號與姓名也會直接加密寫進來。
            解鎖記 30 天，裝置要借人或送修時請先按「鎖定」。
          </p>
          <p className="text-ink/50">
            保管庫每次寫入都會自動留一份版本快照，可防損毀或覆蓋錯；
            但<b>防不了忘記通行碼</b>——伺服器沒有通行碼，忘了就再也解不開。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">病歷號對照維護</h1>
        <p className="mt-1 text-sm text-slate-500">
          病歷號只存在你選定的本機檔案裡，這一頁的所有讀寫都在瀏覽器本機完成，不會送到平台伺服器。新增個案時如果有填病歷號，也會自動寫入同一份檔案。
          <br />
          <span className="text-slate-400">
            為什麼要先選檔案：瀏覽器基於安全考量，不允許網頁自己去讀電腦裡的檔案，一定要由你在檔案對話框中指定哪一份可以存取。
            指定過之後這台電腦的這個瀏覽器會記住，之後只需確認權限、不必重選。
          </span>
        </p>
      </div>

      {/* 診間電腦掛上本機對照表後，可在這裡加密上傳一份給手機／平板查詢用 */}
      <VaultPanel localRows={rows.length > 0 ? rows : null} />

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
            onClick={handleOpenExisting}
            className="whitespace-nowrap rounded-md border border-brand-600 bg-brand-700 px-3 py-1.5 text-xs text-white hover:bg-brand-800"
          >
            {handle ? "改選其他對照表檔案" : "選擇既有對照表檔案"}
          </button>
          <button
            type="button"
            onClick={handleCreateNew}
            className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
          >
            建立新的對照表
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
            <div>
              <label className="block text-xs font-medium text-slate-600">姓名（選填）</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
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
            placeholder="搜尋病歷號 / 姓名 / 研究編號"
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:w-80"
          />

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">病歷號</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">姓名</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">研究編號</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">建立時間</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">個案</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={`${r.mrn}-${i}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-900">{r.mrn}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-700">{r.name || "—"}</td>
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
                    <td colSpan={5} className="whitespace-nowrap px-4 py-6 text-center text-slate-400">
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
