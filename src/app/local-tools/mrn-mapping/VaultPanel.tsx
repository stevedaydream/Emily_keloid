"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { useLocalNames } from "@/components/LocalNameProvider";
import {
  buildRecoveryBackup,
  createVault,
  decryptRowsWithDek,
  isV2,
  newRecoveryCode,
  openVaultWithPassphrase,
  parseRecoveryBackup,
  passphraseIssue,
  unlockWithRecovery,
  type AnyVault,
  type RecoveryBackup,
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
  const [busy, setBusy] = useState<null | "unlock" | "upload" | "recover">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 記住金鑰＝之後新增個案會自動同步到保管庫，不用再打通行碼（見 lib/vaultSession.ts）
  const [remember, setRemember] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  // ── 救援機制（2026-08-25）────────────────────────────────────
  // 剛發出去、還沒被使用者收走的救援碼。**只在這一次顯示**，重新整理就再也拿不到——
  // 平台不留副本，留了就等於門鎖旁邊掛鑰匙。
  const [issuedRecovery, setIssuedRecovery] = useState<{ code: string; backup: RecoveryBackup } | null>(null);
  const [recoveryAck, setRecoveryAck] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  // 忘記通行碼的還原流程：輸入救援碼（或匯入 pwbak.json）→ 解出內容 → 強制重設通行碼
  const [recovering, setRecovering] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState("");
  const [recoveredRows, setRecoveredRows] = useState<MrnMappingRow[] | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [resetPass2, setResetPass2] = useState("");

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
      // 先取得金鑰再解密，這樣「記住」時存的是金鑰本身，通行碼用完就丟。
      // v2 記的是 DEK（換通行碼不必每台裝置重新解鎖）；v1 記的仍是通行碼導出的那把。
      const vault = v as unknown as AnyVault;
      const opened = await openVaultWithPassphrase(vault, unlockPass);
      const rows = opened.rows;
      let dek = opened.dek;
      let fingerprint = opened.fingerprint;

      // 舊格式（v1）就地升級成 v2（2026-08-25）。
      //
      // 為什麼在這裡自動做：v1 沒有 wraps，收案時的 appendRowToVault 寫不回去（會擋下來說格式不對），
      // 所以留著 v1 等於保管庫變成唯讀。而「手上同時有內容與通行碼」的時機**只有解鎖成功這一刻**——
      // 錯過了就要再叫使用者打一次通行碼。通行碼本身不變，變的只有內部格式，
      // 使用者要做的只有把新產生的救援碼存起來。
      let upgraded = false;
      if (!isV2(vault)) {
        const code = newRecoveryCode();
        const { payload, dek: newDek } = await createVault(rows, unlockPass, code);
        const saved = await saveVaultAction(payload);
        if (!saved.ok) throw new Error(`升級保管庫格式失敗：${saved.message}`);
        dek = newDek;
        fingerprint = payload.wraps.passphrase.salt;
        setIssuedRecovery({ code, backup: buildRecoveryBackup(code, payload, new Date().toISOString()) });
        setRecoveryAck(false);
        setMeta({ row_count: payload.row_count, updated_at: new Date().toISOString(), updated_by: null });
        upgraded = true;
      }

      const count = mountFromRows(rows);
      const withName = rows.filter((r) => r.name?.trim()).length;
      if (remember) await rememberVaultKey(dek, fingerprint);
      setNotice(
        `✓ 已解密 ${count} 筆（其中 ${withName} 筆有姓名）。${
          upgraded ? "這份保管庫是舊格式，已自動升級並產生救援碼（通行碼不變），請保存下方的救援碼。" : ""
        }${remember ? "新增個案時會自動同步，關掉分頁才需重打通行碼。" : "重整或關掉分頁就會清除。"}`
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

  /** 下載 pwbak.json。走 Blob + a[download]，檔案不經過伺服器。 */
  function downloadBackup() {
    if (!issuedRecovery) return;
    const blob = new Blob([JSON.stringify(issuedRecovery.backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pwbak.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * 寄到信箱：用 mailto: 開使用者自己的郵件程式，**不經過本平台的伺服器**。
   *
   * 本專案沒有設定任何寄信服務（沒有 API 金鑰），而且就算有，讓救援碼經過第三方寄信服務
   * 也等於多一個看得到鑰匙的地方。mailto 的內容只在使用者自己的裝置與信箱之間。
   * ⚠️ 仍要提醒：信箱本身就是一個副本，別跟病歷號資料放同一個信箱。
   */
  function mailBackup() {
    if (!issuedRecovery || !emailTo.trim()) return;
    const subject = "蟹足腫研究平台－病歷號保管庫救援碼";
    const body = [
      "這是病歷號對照保管庫的救援碼。忘記通行碼時可用它還原並重設。",
      "",
      `救援碼：${issuedRecovery.code}`,
      `建立時間：${issuedRecovery.backup.created_at}`,
      "",
      "⚠️ 這串碼等同鑰匙，請與病歷號資料分開保存，不要轉寄。",
    ].join("\n");
    window.location.href = `mailto:${encodeURIComponent(emailTo.trim())}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
  }

  /** 匯入 pwbak.json，把裡面的救援碼填進輸入框（等同手打，只是免得抄錯）。 */
  async function importBackupFile(file: File) {
    setError(null);
    try {
      setRecoveryInput(parseRecoveryBackup(await file.text()));
      setNotice("已從備份檔讀出救援碼，請按「用救援碼還原」。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "讀取備份檔失敗");
    }
  }

  /** 第一步：用救援碼解開內容。解得開才進入重設通行碼。 */
  async function handleRecover() {
    setError(null);
    setNotice(null);
    setBusy("recover");
    try {
      const v = (await loadVaultAction()) as unknown as AnyVault | null;
      if (!v) throw new Error("雲端還沒有保管庫");
      if (!isV2(v)) throw new Error("這份保管庫是舊格式，沒有救援碼可用；請用通行碼解鎖後重新建立一次");
      const dek = await unlockWithRecovery(v, recoveryInput);
      const rows = await decryptRowsWithDek(v, dek);
      setRecoveredRows(rows);
      setRecoveryInput("");
      setNotice(`✓ 救援碼正確，已解出 ${rows.length} 筆。請接著設定新的通行碼。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "還原失敗");
    } finally {
      setBusy(null);
    }
  }

  /**
   * 第二步：重設通行碼。
   *
   * 走的是「產生全新的 DEK、內容重新加密、兩把金鑰都重新產生」，不是「拿舊 DEK 重新包一份」——
   * unwrap 出來的 DEK 是不可匯出的（包不了），而且救援事件之後換掉整組金鑰本來就比較健康：
   * **舊的救援碼從此完全失效**。
   */
  async function handleResetPassphrase() {
    setError(null);
    if (!recoveredRows) return;
    if (resetPass !== resetPass2) {
      setError("兩次輸入的通行碼不一致");
      return;
    }
    const issue = passphraseIssue(resetPass);
    if (issue) {
      setError(issue);
      return;
    }
    setBusy("recover");
    try {
      const code = newRecoveryCode();
      const { payload, dek } = await createVault(recoveredRows, resetPass, code);
      const result = await saveVaultAction(payload);
      if (!result.ok) throw new Error(result.message);
      await rememberVaultKey(dek, payload.wraps.passphrase.salt);
      mountFromRows(recoveredRows);
      setIssuedRecovery({ code, backup: buildRecoveryBackup(code, payload, new Date().toISOString()) });
      setRecoveryAck(false);
      setMeta({ row_count: payload.row_count, updated_at: new Date().toISOString(), updated_by: null });
      setNotice(`✓ 通行碼已重設（${recoveredRows.length} 筆內容原封不動）。舊的救援碼已失效，請保存下方的新救援碼。`);
      setRecoveredRows(null);
      setRecovering(false);
      setResetPass("");
      setResetPass2("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "重設通行碼失敗");
    } finally {
      setBusy(null);
    }
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
      // v2：產生救援碼，內容用隨機 DEK 加密，DEK 分別被通行碼與救援碼各包一份。
      const code = newRecoveryCode();
      const { payload, dek } = await createVault(rows, uploadPass, code);
      const result = await saveVaultAction(payload);
      if (!result.ok) throw new Error(result.message);
      if (remember) await rememberVaultKey(dek, payload.wraps.passphrase.salt);
      // 救援碼只在這裡出現這一次——平台不留副本，留了就等於門鎖旁邊掛鑰匙
      setIssuedRecovery({ code, backup: buildRecoveryBackup(code, payload, new Date().toISOString()) });
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

      {/* 救援碼發放：只在剛建立／剛重設之後出現這一次，重新整理就再也拿不到 */}
      {issuedRecovery && (
        <div className="space-y-2 rounded-md border-2 border-amber-400 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">請立刻保存救援碼（只會顯示這一次）</p>
          <p className="font-data select-all rounded border border-amber-300 bg-white px-3 py-2 text-center text-base tracking-wider text-ink">
            {issuedRecovery.code}
          </p>
          <p className="text-[11px] text-amber-900">
            忘記通行碼時，用這串碼就能還原並重設。<b>平台沒有留任何副本</b>——這裡關掉就只剩你手上這一份。
            它等同鑰匙，請與病歷號資料<b>分開保存</b>（例如印出來鎖進抽屜、交給部長）。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={downloadBackup}>
              下載 pwbak.json
            </Button>
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="寄到這個信箱（選填）"
              className="min-w-[12rem] flex-1 rounded-md border border-amber-300 px-2 py-1.5 text-sm"
            />
            <Button type="button" variant="outline" onClick={mailBackup} disabled={!emailTo.trim()}>
              寄出
            </Button>
          </div>
          <p className="text-[11px] text-amber-800/80">
            「寄出」會開啟你自己的郵件程式並把內容填好，<b>不經過本平台的伺服器</b>。
            寄出後那封信就是一份副本，別放在跟病歷號資料同一個信箱。
          </p>
          <label className="flex items-center gap-1.5 text-xs text-amber-900">
            <input type="checkbox" checked={recoveryAck} onChange={(e) => setRecoveryAck(e.target.checked)} />
            我已經把救援碼存好了
          </label>
          <Button type="button" variant="outline" disabled={!recoveryAck} onClick={() => setIssuedRecovery(null)}>
            關閉
          </Button>
        </div>
      )}

      {/* 忘記通行碼：兩條路（手打救援碼／匯入 pwbak.json）都通往同一件事——解開後強制重設 */}
      {meta && !issuedRecovery && (
        <div className="rounded-md border border-brand-100 p-3">
          {!recovering ? (
            <button
              type="button"
              onClick={() => {
                setRecovering(true);
                setError(null);
                setNotice(null);
              }}
              className="text-xs text-brand-700 underline"
            >
              忘記通行碼？用救援碼或 pwbak.json 還原
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-ink/70">用救援碼還原</p>
              {!recoveredRows ? (
                <>
                  <input
                    value={recoveryInput}
                    onChange={(e) => setRecoveryInput(e.target.value)}
                    placeholder="貼上或輸入救援碼（連字號可有可無）"
                    className="font-data w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
                  />
                  <label className="block text-[11px] text-ink/60">
                    或匯入備份檔：
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void importBackupFile(f);
                      }}
                      className="ml-1 text-[11px] file:mr-2 file:rounded file:border-0 file:bg-brand-100 file:px-2 file:py-1"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRecover}
                      disabled={!recoveryInput.trim()}
                      pending={busy === "recover"}
                      pendingText="還原中…"
                    >
                      用救援碼還原
                    </Button>
                    <button type="button" onClick={() => setRecovering(false)} className="text-xs text-ink/50 underline">
                      取消
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-emerald-800">
                    已解出 {recoveredRows.length} 筆。設定新的通行碼後會<b>重新產生一組救援碼</b>（舊的那組從此失效）。
                  </p>
                  <input
                    type="password"
                    value={resetPass}
                    onChange={(e) => setResetPass(e.target.value)}
                    placeholder="新的通行碼（至少 12 字元）"
                    autoComplete="new-password"
                    className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
                  />
                  <input
                    type="password"
                    value={resetPass2}
                    onChange={(e) => setResetPass2(e.target.value)}
                    placeholder="再輸入一次"
                    autoComplete="new-password"
                    className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleResetPassphrase}
                    disabled={resetPass.length === 0}
                    pending={busy === "recover"}
                    pendingText="重設中…"
                  >
                    重設通行碼並產生新救援碼
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}

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
