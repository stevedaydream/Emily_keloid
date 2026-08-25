"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import SubmitButton from "@/components/ui/SubmitButton";
import { setTestModeAction, deleteTestCasesAction } from "./actions";

/**
 * 測試模式的開關與清理（使用者要求 2026-08-25）。
 *
 * 刪除是不可逆的，所以刻意做成兩段式：先按「刪除」→ 顯示筆數與確認 → 再按一次才真的刪。
 * 沒有第二段的話，一個誤觸就把當天收的東西全清掉——而測試期間正是最容易誤觸的時候。
 */
export default function TestModePanel({ on, testCount }: { on: boolean; testCount: number }) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await deleteTestCasesAction();
        setResult(`已刪除 ${r.deleted} 筆測試個案（連同其問卷、照片、治療紀錄等一併清除）`);
        setConfirming(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "刪除失敗");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className={`rounded-lg border-2 p-4 ${on ? "border-amber-400 bg-amber-50" : "border-brand-100 bg-white"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">
              目前狀態：
              {on ? (
                <span className="ml-1 rounded bg-amber-500 px-2 py-0.5 text-white">測試模式（開啟中）</span>
              ) : (
                <span className="ml-1 rounded bg-emerald-600 px-2 py-0.5 text-white">正式模式</span>
              )}
            </p>
            <p className="mt-1 text-xs text-ink/60">
              {on
                ? "現在建立的個案都會被標記為「測試」，預設不會進匯出檔，之後可在下方一鍵刪除。"
                : "現在建立的個案是正式資料，不會被下方的刪除功能碰到。"}
            </p>
          </div>
          <form action={setTestModeAction}>
            <input type="hidden" name="on" value={on ? "0" : "1"} />
            <SubmitButton variant={on ? "outline" : "primary"} pendingText="切換中…">
              {on ? "關閉測試模式（改為正式）" : "開啟測試模式"}
            </SubmitButton>
          </form>
        </div>
      </div>

      <div className="rounded-lg border border-brand-100 bg-white p-4 text-sm">
        <h2 className="text-sm font-semibold text-ink/80">標記是跟著資料走的</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink/60">
          <li>「測試」是在<b>建檔當下</b>蓋章的，關掉開關不會把先前的測試個案變成正式資料。</li>
          <li>結構化資料匯出<b>預設排除</b>測試個案；需要時可在匯出頁勾「包含測試個案」。</li>
          <li>個案列表與個案頁的測試個案會掛一個橘色「測試」標籤，全站頂端也會有橫幅。</li>
        </ul>
      </div>

      <div className="rounded-lg border-2 border-red-200 bg-red-50/50 p-4">
        <h2 className="text-sm font-semibold text-red-800">刪除所有測試個案</h2>
        <p className="mt-1 text-xs text-ink/60">
          目前有 <b className="text-red-700">{testCount}</b> 筆測試個案。
          刪除會一併清除它們的問卷回覆、照片紀錄、治療紀錄、時程、待補清單等所有附屬資料，
          <b>無法復原</b>。正式個案一筆都不會動到。
        </p>
        <p className="mt-1 text-xs text-ink/50">
          ⚠️ 照片檔案本身存在 Supabase Storage，這裡只會刪掉資料庫紀錄；儲存桶裡的檔案要另外清。
        </p>

        {testCount > 0 && (
          <div className="mt-3">
            {!confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
              >
                刪除 {testCount} 筆測試個案…
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-300 bg-white px-3 py-2">
                <span className="text-sm text-red-800">確定要刪除 {testCount} 筆測試個案？此操作無法復原。</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={pending}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  {pending ? "刪除中…" : "確定刪除"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-md border border-brand-200 px-3 py-1.5 text-sm text-ink/60"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        )}

        {result && <p className="mt-2 rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{result}</p>}
        {error && <p className="mt-2 rounded bg-red-100 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>

      <p className="text-xs text-ink/40">
        收案在{" "}
        <Link href="/intake" className="underline">
          收案頁
        </Link>
        ，匯出在{" "}
        <Link href="/export" className="underline">
          資料匯出
        </Link>
        。
      </p>
    </div>
  );
}
