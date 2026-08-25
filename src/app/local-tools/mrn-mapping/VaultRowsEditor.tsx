"use client";

// 保管庫內容的新增／修改／刪除（決策 2026-08-20）。
//
// 只在**沒有 File System Access 的裝置**（手機／平板）上出現。理由是「這台裝置的權威來源是哪一份」：
// 桌機上本機 CSV 才是權威，直接改保管庫會造成兩邊不同步——下次有人從桌機上傳整份 CSV，
// 平板改過的內容就被無聲蓋掉。所以桌機維持改 CSV、平板改保管庫，各自只有一個編輯面。
//
// 保管庫是單一 blob，沒有「只改一列」這回事：每次都是整份重新加密覆蓋（百來筆約 20KB）。

import { useCallback, useEffect, useState } from "react";
import type { MrnMappingRow } from "@/lib/localMrnStore";
import { decryptRowsWithDek } from "@/lib/mrnVault";
import { getVaultKey, subscribeVaultSession, syncVaultIfUnlocked } from "@/lib/vaultSession";
import { loadVaultAction } from "./vaultActions";
import { useLocalNames } from "@/components/LocalNameProvider";

const field = "rounded-md border border-brand-200 px-2 py-1.5 text-sm";

export default function VaultRowsEditor() {
  const { mountFromRows } = useLocalNames();
  const [unlocked, setUnlocked] = useState(false);
  const [rows, setRows] = useState<MrnMappingRow[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState({ research_id: "", mrn: "", name: "" });

  const load = useCallback(async () => {
    const held = await getVaultKey();
    setUnlocked(!!held);
    if (!held) {
      setRows(null);
      return;
    }
    try {
      const payload = await loadVaultAction();
      const decrypted = payload ? await decryptRowsWithDek(payload, held.key) : [];
      setRows(decrypted);
      setError(null);
    } catch (err) {
      setRows(null);
      setError(err instanceof Error ? err.message : "讀取保管庫失敗");
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeVaultSession(() => void load());
    // 首次載入排到 microtask，effect 本體不直接呼叫會 setState 的函式
    // （load 裡的 setState 其實都在 await 之後，但 lint 規則看不出來）
    void Promise.resolve().then(load);
    return unsubscribe;
  }, [load]);

  /** 任何異動都走這裡：整份重新加密上傳，成功後才更新畫面與姓名掛載。 */
  async function commit(next: MrnMappingRow[], successMsg: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await syncVaultIfUnlocked(next);
    setBusy(false);
    if (result.status !== "synced") {
      setError(result.status === "locked" ? "保管庫已鎖定，請重新解鎖" : result.message ?? "寫入失敗");
      return;
    }
    setRows(next);
    mountFromRows(next);
    setNotice(successMsg);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!rows) return;
    const researchId = draft.research_id.trim();
    if (!researchId) {
      setError("研究編號必填");
      return;
    }
    if (rows.some((r) => r.research_id === researchId)) {
      setError(`研究編號 ${researchId} 已經有對照了，請直接修改下面那一列`);
      return;
    }
    await commit(
      [
        ...rows,
        {
          research_id: researchId,
          mrn: draft.mrn.trim(),
          name: draft.name.trim(),
          case_id: "",
          created_at: new Date().toISOString(),
        },
      ],
      `已新增 ${researchId}`
    );
    setDraft({ research_id: "", mrn: "", name: "" });
  }

  if (!unlocked) return null;

  const filtered = q.trim()
    ? (rows ?? []).filter((r) => {
        const n = q.trim().toLowerCase();
        return (
          r.research_id.toLowerCase().includes(n) ||
          r.mrn.toLowerCase().includes(n) ||
          (r.name ?? "").toLowerCase().includes(n)
        );
      })
    : rows ?? [];

  return (
    <div className="space-y-3 rounded-lg border border-brand-100 bg-paper-raised p-4">
      <div>
        <h2 className="text-sm font-semibold text-brand-900">
          保管庫內容
          <span className="ml-2 font-data text-xs font-normal text-ink/40">{rows?.length ?? 0} 筆</span>
        </h2>
        <p className="mt-1 text-xs text-ink/50">
          這台裝置寫不了本機 CSV，所以直接編輯雲端保管庫。每次存檔都是整份重新加密覆蓋，
          伺服器只收密文；並自動留一份版本快照。
        </p>
      </div>

      {error && <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</p>}
      {notice && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">{notice}</p>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 rounded-md border border-brand-100 p-3">
        <div>
          <label className="block text-xs font-medium text-ink/60">研究編號</label>
          <input
            value={draft.research_id}
            onChange={(e) => setDraft({ ...draft, research_id: e.target.value })}
            placeholder="YEN-2026-001"
            className={`mt-1 w-36 font-data ${field}`}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60">病歷號</label>
          <input
            value={draft.mrn}
            onChange={(e) => setDraft({ ...draft, mrn: e.target.value })}
            className={`mt-1 w-32 ${field}`}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60">姓名</label>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className={`mt-1 w-28 ${field}`}
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-brand-700 px-3 py-2 text-sm text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {busy ? "處理中…" : "新增對照"}
        </button>
      </form>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜尋研究編號 / 病歷號 / 姓名"
        className={`w-full ${field}`}
      />

      <ul className="space-y-1">
        {filtered.map((r) => (
          <VaultRow
            key={r.research_id}
            row={r}
            busy={busy}
            onSave={(mrn, name) =>
              commit(
                (rows ?? []).map((x) => (x.research_id === r.research_id ? { ...x, mrn, name } : x)),
                `已更新 ${r.research_id}`
              )
            }
            onDelete={() =>
              commit(
                (rows ?? []).filter((x) => x.research_id !== r.research_id),
                `已刪除 ${r.research_id}`
              )
            }
          />
        ))}
        {filtered.length === 0 && (
          <li className="rounded-md border border-dashed border-brand-200 p-3 text-center text-sm text-ink/40">
            {rows && rows.length > 0 ? "沒有符合的對照" : "保管庫目前沒有任何對照"}
          </li>
        )}
      </ul>
    </div>
  );
}

function VaultRow({
  row,
  busy,
  onSave,
  onDelete,
}: {
  row: MrnMappingRow;
  busy: boolean;
  onSave: (mrn: string, name: string) => void;
  onDelete: () => void;
}) {
  const [mrn, setMrn] = useState(row.mrn);
  const [name, setName] = useState(row.name ?? "");
  // 刪除不可逆（保管庫沒有回收桶），所以要按兩次才真的刪
  const [confirming, setConfirming] = useState(false);
  const dirty = mrn !== row.mrn || name !== (row.name ?? "");

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border border-brand-50 px-3 py-2">
      <span className="w-32 shrink-0 font-data text-sm text-brand-900">{row.research_id}</span>
      <input value={mrn} onChange={(e) => setMrn(e.target.value)} placeholder="病歷號" className={`w-32 ${field}`} />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="姓名" className={`w-28 ${field}`} />
      {dirty && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(mrn.trim(), name.trim())}
          className="rounded-md border border-brand-300 px-2 py-1.5 text-xs text-brand-800 hover:bg-brand-50 disabled:opacity-50"
        >
          儲存
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (confirming) onDelete();
          else setConfirming(true);
        }}
        onBlur={() => setConfirming(false)}
        className={`ml-auto whitespace-nowrap rounded-md px-2 py-1.5 text-xs disabled:opacity-50 ${
          confirming ? "bg-red-600 text-white" : "text-ink/40 underline hover:text-red-600"
        }`}
      >
        {confirming ? "再按一次確認刪除" : "刪除"}
      </button>
    </li>
  );
}
