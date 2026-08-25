"use client";

import { useState, useTransition } from "react";
import Button from "@/components/ui/Button";
import { setExportKeyAction } from "./actions";

/**
 * 匯出金鑰的設定畫面（2026-08-25）。
 *
 * 這把金鑰控制的是「匯出檔裡要不要有病歷號與姓名」。**它不是資料庫的加密金鑰**——
 * 資料庫裡那兩欄就是明文，拿得到 Supabase 金鑰的人直接讀表就有了。
 * 這一點在畫面上要講清楚，不要讓人以為設了金鑰資料就加密了。
 *
 * 救援碼沿用保管庫那一套的做法：只顯示一次、可下載 pwbak.json、可用 mailto 寄給自己。
 */
export default function ExportKeyPanel({ alreadySet }: { alreadySet: boolean }) {
  const [newKey, setNewKey] = useState("");
  const [confirmKey, setConfirmKey] = useState("");
  const [currentKey, setCurrentKey] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await setExportKeyAction({
          newKey,
          confirmKey,
          currentKey: useRecovery ? undefined : currentKey,
          recoveryCode: useRecovery ? recoveryInput : undefined,
          alreadySet,
        });
        setIssued(r.recoveryCode);
        setAck(false);
        setNewKey("");
        setConfirmKey("");
        setCurrentKey("");
        setRecoveryInput("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "設定失敗");
      }
    });
  }

  function downloadBackup() {
    if (!issued) return;
    const backup = {
      kind: "keloid-export-key-recovery",
      version: 1,
      recovery_code: issued,
      created_at: new Date().toISOString(),
      note: "蟹足腫研究平台－匯出金鑰的救援碼。忘記金鑰時可用它重設。這串碼等同金鑰，請妥善保管。",
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "pwbak.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function mailBackup() {
    if (!issued || !emailTo.trim()) return;
    const body = [
      "這是蟹足腫研究平台「匯出金鑰」的救援碼。忘記金鑰時可用它重設。",
      "",
      `救援碼：${issued}`,
      "",
      "⚠️ 這串碼等同金鑰，請與匯出檔分開保存，不要轉寄。",
    ].join("\n");
    window.location.href = `mailto:${encodeURIComponent(emailTo.trim())}?subject=${encodeURIComponent(
      "蟹足腫研究平台－匯出金鑰救援碼"
    )}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border-2 border-amber-200 bg-amber-50/60 p-4 text-sm">
        <p className="font-medium text-amber-900">這把金鑰保護的是「檔案」，不是「資料」</p>
        <p className="mt-1 text-xs text-ink/60">
          2026-08-25 起病歷號與姓名<b>明文存在資料庫</b>，平台內部各頁面照常顯示（收案、個案頁、
          今日門診、搜尋都要用）。金鑰擋的是<b>匯出檔</b>——沒有金鑰匯出來的檔案，
          Name / Chart No. 兩欄是空的。拿得到資料庫連線的人不受這道門限制。
        </p>
      </div>

      <div className="rounded-lg border border-brand-100 bg-white p-4">
        <p className="text-sm font-medium text-ink">
          目前狀態：
          {alreadySet ? (
            <span className="ml-1 rounded bg-emerald-600 px-2 py-0.5 text-white">已設定</span>
          ) : (
            <span className="ml-1 rounded bg-amber-500 px-2 py-0.5 text-white">尚未設定</span>
          )}
        </p>
        {!alreadySet && (
          <p className="mt-1 text-xs text-ink/60">
            還沒設定金鑰之前，<b>任何人都匯不出病歷號與姓名</b>（勾了也是空欄）。要用這個功能請先設定。
          </p>
        )}

        <div className="mt-3 space-y-2">
          {alreadySet && (
            <>
              <div className="flex flex-wrap gap-3 text-xs text-ink/60">
                <label className="flex items-center gap-1">
                  <input type="radio" checked={!useRecovery} onChange={() => setUseRecovery(false)} />
                  用舊金鑰驗證
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" checked={useRecovery} onChange={() => setUseRecovery(true)} />
                  忘記了，用救援碼
                </label>
              </div>
              {useRecovery ? (
                <input
                  value={recoveryInput}
                  onChange={(e) => setRecoveryInput(e.target.value)}
                  placeholder="救援碼（連字號可有可無）"
                  className="font-data w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
                />
              ) : (
                <input
                  type="password"
                  value={currentKey}
                  onChange={(e) => setCurrentKey(e.target.value)}
                  placeholder="目前的金鑰"
                  autoComplete="off"
                  className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
                />
              )}
            </>
          )}
          <input
            type="password"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder={alreadySet ? "新的金鑰（至少 8 字元）" : "設定金鑰（至少 8 字元）"}
            autoComplete="new-password"
            className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
          />
          <input
            type="password"
            value={confirmKey}
            onChange={(e) => setConfirmKey(e.target.value)}
            placeholder="再輸入一次"
            autoComplete="new-password"
            className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
          />
          <Button
            type="button"
            onClick={submit}
            disabled={!newKey}
            pending={pending}
            pendingText="儲存中…"
          >
            {alreadySet ? "更換金鑰" : "設定金鑰"}
          </Button>
        </div>

        {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>

      {issued && (
        <div className="space-y-2 rounded-md border-2 border-amber-400 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">請立刻保存救援碼（只會顯示這一次）</p>
          <p className="font-data select-all rounded border border-amber-300 bg-white px-3 py-2 text-center text-base tracking-wider text-ink">
            {issued}
          </p>
          <p className="text-[11px] text-amber-900">
            忘記金鑰時，用這串碼就能重設。<b>平台只留它的雜湊，沒有留原文</b>——這裡關掉就只剩你手上這一份。
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
            「寄出」會開啟你自己的郵件程式並把內容填好，不經過本平台的伺服器。
          </p>
          <label className="flex items-center gap-1.5 text-xs text-amber-900">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            我已經把救援碼存好了
          </label>
          <Button type="button" variant="outline" disabled={!ack} onClick={() => setIssued(null)}>
            關閉
          </Button>
        </div>
      )}
    </div>
  );
}
