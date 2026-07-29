"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { useLocalNames } from "@/components/LocalNameProvider";
import { decryptRows, encryptRows, passphraseIssue } from "@/lib/mrnVault";
import { loadVaultAction, saveVaultAction } from "./vaultActions";
import type { MrnMappingRow } from "@/lib/localMrnStore";

type VaultMeta = { row_count: number; updated_at: string; updated_by: string | null };

/**
 * 雲端加密保管庫。
 *
 * 兩個方向：
 * - 上傳：把目前掛著的本機對照表加密後存到雲端（只有桌機掛得上本機檔案，所以這一側通常在診間電腦做）
 * - 解密掛載：任何裝置（含手機／平板）輸入通行碼，把雲端的密文解開讀進記憶體
 *
 * 通行碼與解密結果都只存在記憶體，重整就沒。
 */
export default function VaultPanel({ localRows }: { localRows: MrnMappingRow[] | null }) {
  const { mountFromRows } = useLocalNames();
  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [unlockPass, setUnlockPass] = useState("");
  const [uploadPass, setUploadPass] = useState("");
  const [uploadPass2, setUploadPass2] = useState("");
  const [busy, setBusy] = useState<null | "unlock" | "upload">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const v = await loadVaultAction();
        if (v) setMeta({ row_count: v.row_count, updated_at: v.updated_at, updated_by: v.updated_by });
      } catch {
        /* 讀不到就當作還沒建立保管庫 */
      } finally {
        setLoadingMeta(false);
      }
    })();
  }, []);

  async function handleUnlock() {
    setError(null);
    setNotice(null);
    setBusy("unlock");
    try {
      const v = await loadVaultAction();
      if (!v) throw new Error("雲端還沒有保管庫，請先在診間電腦上傳一次");
      const rows = await decryptRows(v, unlockPass);
      const count = mountFromRows(rows);
      const withName = rows.filter((r) => r.name?.trim()).length;
      setNotice(`✓ 已解密 ${count} 筆（其中 ${withName} 筆有姓名）。重整或關掉分頁就會清除。`);
      setUnlockPass("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "解密失敗");
    } finally {
      setBusy(null);
    }
  }

  async function handleUpload() {
    setError(null);
    setNotice(null);
    if (!localRows || localRows.length === 0) {
      setError("目前沒有掛上本機對照表，無法上傳");
      return;
    }
    if (uploadPass !== uploadPass2) {
      setError("兩次輸入的通行碼不一致");
      return;
    }
    const issue = passphraseIssue(uploadPass);
    if (issue) {
      setError(issue);
      return;
    }
    setBusy("upload");
    try {
      const payload = await encryptRows(localRows, uploadPass);
      const result = await saveVaultAction(payload);
      if (!result.ok) throw new Error(result.message);
      setNotice(`✓ ${result.message}`);
      setMeta({ row_count: payload.row_count, updated_at: new Date().toISOString(), updated_by: null });
      setUploadPass("");
      setUploadPass2("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "上傳失敗");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-brand-200 bg-paper-raised p-4 text-sm">
      <div>
        <h2 className="font-heading text-base font-medium text-brand-900">雲端加密保管庫</h2>
        <p className="mt-1 text-xs text-ink/50">
          對照表在<b>這台瀏覽器內</b>加密後才上傳，伺服器與資料庫只看得到密文，<b>通行碼永遠不會送出</b>。
          手機／平板掛不上本機檔案，可用這裡輸入通行碼解密查詢。
        </p>
      </div>

      <p className="rounded-md bg-brand-50 px-3 py-2 text-xs text-brand-900">
        {loadingMeta
          ? "讀取保管庫狀態…"
          : meta
          ? `雲端目前有 ${meta.row_count} 筆，最後更新 ${new Date(meta.updated_at).toLocaleString("zh-TW")}${
              meta.updated_by ? `（${meta.updated_by}）` : ""
            }`
          : "雲端尚未建立保管庫"}
      </p>

      {/* 解密掛載：任何裝置都能用 */}
      {meta && (
        <div className="space-y-2 rounded-md border border-brand-100 p-3">
          <p className="text-xs font-medium text-ink/70">解密掛載（本次工作階段）</p>
          <input
            type="password"
            value={unlockPass}
            onChange={(e) => setUnlockPass(e.target.value)}
            placeholder="通行碼"
            autoComplete="off"
            className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
          />
          <Button
            type="button"
            onClick={handleUnlock}
            disabled={unlockPass.length === 0}
            pending={busy === "unlock"}
            pendingText="解密中…"
          >
            解密並顯示姓名
          </Button>
          <p className="text-[11px] text-ink/40">
            解密結果只放在記憶體，<b>不會寫進這台裝置</b>；重整或關掉分頁就清除，需要時再輸入一次。
          </p>
        </div>
      )}

      {/* 上傳：需要先掛上本機對照表，通常在診間電腦做 */}
      <div className="space-y-2 rounded-md border border-brand-100 p-3">
        <p className="text-xs font-medium text-ink/70">
          {meta ? "以目前的本機對照表覆蓋雲端" : "建立保管庫（上傳目前的本機對照表）"}
        </p>
        {localRows && localRows.length > 0 ? (
          <>
            <p className="text-[11px] text-ink/50">將加密上傳目前掛著的 {localRows.length} 筆對照。</p>
            <input
              type="password"
              value={uploadPass}
              onChange={(e) => setUploadPass(e.target.value)}
              placeholder="設定通行碼（至少 12 字元）"
              autoComplete="new-password"
              className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
            <input
              type="password"
              value={uploadPass2}
              onChange={(e) => setUploadPass2(e.target.value)}
              placeholder="再輸入一次"
              autoComplete="new-password"
              className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleUpload}
              disabled={uploadPass.length === 0}
              pending={busy === "upload"}
              pendingText="加密上傳中…"
            >
              加密並上傳
            </Button>
          </>
        ) : (
          <p className="text-[11px] text-ink/40">
            需要先在本頁上方掛上本機對照表才能上傳（本機檔案是正本，保管庫是給行動裝置查詢用的副本）。
          </p>
        )}
      </div>

      {notice && <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</p>}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <p className="text-[11px] text-ink/40">
        ⚠️ 通行碼遺失就<b>無法還原</b>——伺服器沒有備份，也沒有「忘記密碼」。本機 CSV 仍是正本，請妥善保管。
        通行碼請與登入密碼分開，並只給需要查詢姓名的團隊成員。
      </p>
    </div>
  );
}
