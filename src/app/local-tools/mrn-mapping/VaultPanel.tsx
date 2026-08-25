"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { useLocalNames } from "@/components/LocalNameProvider";
import {
  decryptWithKey,
  deriveVaultKey,
  encryptWithKey,
  newSalt,
  passphraseIssue,
  PBKDF2_ITERATIONS,
} from "@/lib/mrnVault";
import { forgetVaultKey, getVaultKey, getVaultKeyDaysLeft, rememberVaultKey, subscribeVaultSession } from "@/lib/vaultSession";
import { loadVaultAction, saveVaultAction } from "./vaultActions";
import type { MrnMappingRow } from "@/lib/localMrnStore";

type VaultMeta = { row_count: number; updated_at: string; updated_by: string | null };

function RememberToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-ink/60">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      記住 30 天（之後收案自動寫入保管庫，不必再打通行碼）
    </label>
  );
}

/**
 * 雲端加密保管庫。
 *
 * 2026-08-20 起這是病歷號對照的**權威來源**（收案動線移到平板，而平板沒有 File System Access
 * 寫不了本機 CSV）。解鎖後收案會直接把新的對照加密寫進來，見 lib/vaultSession 的 appendRowToVault。
 *
 * 兩個方向：
 * - 上傳：把目前掛著的本機對照表整份加密後覆蓋雲端（桌機才掛得上本機檔案）
 * - 解密掛載：任何裝置（含手機／平板）輸入通行碼，把雲端的密文解開讀進記憶體
 *
 * 通行碼從頭到尾沒有以可讀形式落地；解鎖狀態記 30 天（金鑰是 extractable:false 的 CryptoKey，
 * 存得進 IndexedDB 但匯不出金鑰材料）。裝置要借人或送修時按「鎖定」立即失效。
 *
 * 每次寫入都會自動留一份版本快照（mrn_vault_versions，保留最近 30 份），
 * 防的是 blob 損毀／覆蓋錯——**防不了忘記通行碼**，快照用的是同一組通行碼。
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
  // 記住金鑰＝之後新增個案會自動同步到保管庫，不用再打通行碼（見 lib/vaultSession.ts）
  const [remember, setRemember] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

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

  useEffect(() => {
    const refresh = () => {
      void getVaultKey().then((k) => setUnlocked(!!k));
      void getVaultKeyDaysLeft().then(setDaysLeft);
    };
    refresh();
    return subscribeVaultSession(refresh);
  }, []);

  async function handleUnlock() {
    setError(null);
    setNotice(null);
    setBusy("unlock");
    try {
      const v = await loadVaultAction();
      if (!v) throw new Error("雲端還沒有保管庫，請先在診間電腦上傳一次");
      const iterations = v.iterations || PBKDF2_ITERATIONS;
      // 先導出金鑰再解密，這樣「記住」時存的是金鑰本身，通行碼用完就丟
      const key = await deriveVaultKey(unlockPass, v.salt, iterations);
      const rows = await decryptWithKey(v, key);
      const count = mountFromRows(rows);
      const withName = rows.filter((r) => r.name?.trim()).length;
      if (remember) await rememberVaultKey(key, v.salt, iterations);
      setNotice(
        `✓ 已解密 ${count} 筆（其中 ${withName} 筆有姓名）。${
          remember ? "新增個案時會自動同步，關掉分頁才需重打通行碼。" : "重整或關掉分頁就會清除。"
        }`
      );
      setUnlockPass("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "解密失敗");
    } finally {
      setBusy(null);
    }
  }

  async function handleLock() {
    await forgetVaultKey();
    setNotice("已鎖定，新增個案將不再自動同步。");
  }

  /**
   * 建立保管庫 / 以本機對照表覆蓋。
   *
   * 2026-08-25：原本這支硬性要求 `localRows.length > 0`，於是**保管庫只生得出來自桌機**
   * （手機／平板沒有 File System Access，掛不上本機 CSV），而且那台桌機還得先有一筆對照。
   * 這跟 2026-08-20 的決策「收案動線移到平板、保管庫取代 CSV 當權威來源」直接矛盾——
   * 權威來源的誕生條件竟然是它要取代的那個東西。實測結果就是保管庫從來沒被建立過，
   * 於是每台裝置都退化成「沒有對照表可比對」，收案時病歷號欄位一律停用、重複收案也擋不住。
   *
   * 現在分兩種情況：
   *   · 雲端還沒有保管庫（meta === null）→ **任何裝置**都能建立，內容可以是空的，
   *     之後平板收案由 appendRowToVault 一筆一筆長出來。桌機若剛好掛著 CSV 就順便帶進去。
   *   · 已經有保管庫 → 維持原本的「以本機對照表覆蓋」，仍然只有桌機做得到。
   */
  async function handleUpload() {
    setError(null);
    setNotice(null);
    const creating = !meta;
    // 覆蓋既有保管庫時仍要求有本機資料——空陣列覆蓋掉現有內容等於一鍵清空。
    if (!creating && (!localRows || localRows.length === 0)) {
      setError("目前沒有掛上本機對照表，無法覆蓋雲端保管庫");
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
      // 建立時再確認一次雲端仍然是空的：兩台裝置同時看到「尚未建立」各自按下去的話，
      // 後按的那台會用自己的 salt 覆蓋掉先按的那台，先建的那把通行碼就再也開不了。
      if (creating) {
        const existing = await loadVaultAction();
        if (existing) {
          setMeta({ row_count: existing.row_count, updated_at: existing.updated_at, updated_by: existing.updated_by });
          throw new Error("雲端剛剛已經有人建立了保管庫，請改用上方的通行碼解鎖（不要覆蓋，否則舊內容需要舊通行碼才救得回）");
        }
      }
      const rows = localRows ?? [];
      const salt = newSalt();
      const key = await deriveVaultKey(uploadPass, salt, PBKDF2_ITERATIONS);
      const payload = await encryptWithKey(rows, key, salt, PBKDF2_ITERATIONS);
      const result = await saveVaultAction(payload);
      if (!result.ok) throw new Error(result.message);
      if (remember) await rememberVaultKey(key, salt, PBKDF2_ITERATIONS);
      // 建立／覆蓋完就把內容掛進記憶體，姓名立刻顯示得出來，不用再解鎖一次
      mountFromRows(rows);
      setNotice(
        creating
          ? `✓ 保管庫已建立（${rows.length} 筆）${remember ? "，這台裝置已解鎖，之後收案會自動寫入" : "，記得在收案的裝置上解鎖才會自動寫入"}`
          : `✓ ${result.message}${remember ? "，之後新增個案會自動同步" : ""}`
      );
      setMeta({ row_count: payload.row_count, updated_at: new Date().toISOString(), updated_by: null });
      setUploadPass("");
      setUploadPass2("");
    } catch (err) {
      setError(err instanceof Error ? err.message : creating ? "建立保管庫失敗" : "上傳失敗");
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

      <div className="flex flex-wrap items-center gap-2 rounded-md bg-brand-50 px-3 py-2 text-xs text-brand-900">
        <span>
          {loadingMeta
            ? "讀取保管庫狀態…"
            : meta
            ? `雲端目前有 ${meta.row_count} 筆，最後更新 ${new Date(meta.updated_at).toLocaleString("zh-TW")}${
                meta.updated_by ? `（${meta.updated_by}）` : ""
              }`
            : "雲端尚未建立保管庫"}
        </span>
        {unlocked && (
          <span className="ml-auto flex items-center gap-2">
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">
              🔓 已解鎖{daysLeft !== null ? `，還剩 ${daysLeft} 天` : ""}，收案自動寫入
            </span>
            <button type="button" onClick={() => void handleLock()} className="underline hover:text-red-600">
              鎖定
            </button>
          </span>
        )}
      </div>

      {/* 解密掛載：任何裝置都能用 */}
      {meta && (
        <div className="space-y-2 rounded-md border border-brand-100 p-3">
          <p className="text-xs font-medium text-ink/70">解密掛載（解鎖後記住 30 天）</p>
          <input
            type="password"
            value={unlockPass}
            onChange={(e) => setUnlockPass(e.target.value)}
            placeholder="通行碼"
            autoComplete="off"
            className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
          />
          <RememberToggle checked={remember} onChange={setRemember} />
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
            解密出來的姓名只放在記憶體，<b>不會寫進這台裝置</b>，重整就清除。
            勾了「記住」則另外把<b>金鑰</b>（不是通行碼）留到分頁關閉為止，供自動同步使用。
          </p>
        </div>
      )}

      {/* 建立（任何裝置都可以）／覆蓋（需要本機對照表，通常在診間電腦做） */}
      <div className="space-y-2 rounded-md border border-brand-100 p-3">
        <p className="text-xs font-medium text-ink/70">
          {meta ? "以目前的本機對照表覆蓋雲端" : "在這台裝置建立保管庫"}
        </p>
        {!meta && (
          <p className="text-[11px] text-ink/50">
            {localRows && localRows.length > 0
              ? `會把目前掛著的 ${localRows.length} 筆對照加密後上傳。`
              : "先建立一個空的保管庫即可——之後在這台或任何一台解鎖過的裝置收案，對照就會自動加密寫進來。"}
            <br />
            通行碼是<b>整個團隊共用</b>的一把，設定後請記在安全的地方：
            <b>遺失就無法還原</b>（伺服器沒有備份，版本快照也是用同一把金鑰加密的）。
          </p>
        )}
        {/* 沒有保管庫 → 任何裝置都能建立（內容可以是空的）；已經有 → 只有掛著本機對照表才給覆蓋。
            ⚠️ 這個條件曾經寫反成 `meta || (...)`，結果「尚未建立保管庫」時反而不給輸入通行碼，
            手機上只看得到「需要先掛上本機對照表」——正是這次要修掉的死路。 */}
        {!meta || (localRows && localRows.length > 0) ? (
          <>
            {meta && localRows && (
              <p className="text-[11px] text-ink/50">將加密上傳目前掛著的 {localRows.length} 筆對照。</p>
            )}
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
            <RememberToggle checked={remember} onChange={setRemember} />
            <Button
              type="button"
              variant="outline"
              onClick={handleUpload}
              disabled={uploadPass.length === 0}
              pending={busy === "upload"}
              pendingText={meta ? "加密上傳中…" : "建立中…"}
            >
              {meta ? "加密並上傳" : "建立保管庫"}
            </Button>
          </>
        ) : (
          <p className="text-[11px] text-ink/40">
            需要先在本頁上方掛上本機對照表才能覆蓋雲端（覆蓋＝拿本機那份整份換掉雲端那份）。
          </p>
        )}
      </div>

      {notice && <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</p>}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <p className="text-[11px] text-ink/40">
        ⚠️ 通行碼遺失就<b>無法還原</b>——伺服器沒有備份，也沒有「忘記密碼」。
        2026-08-20 起保管庫是病歷號對照的正本（收案動線在平板上，而平板寫不了本機 CSV），
        桌機的本機 CSV 是另一份備份。通行碼請與登入密碼分開，並只給需要查詢姓名的團隊成員。
      </p>
    </div>
  );
}
