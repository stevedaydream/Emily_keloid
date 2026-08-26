"use client";

import { useState } from "react";
import { markScheduleItemAction } from "./actions";

/**
 * 「標記完成」＋未完成事項的確認（2026-08-26）。
 *
 * 原本這裡是一顆直接送出的 <form>，於是「問卷還沒填就把那一列標完成」按一下就成立，
 * 而已完成的列在改版前沒有回頭路、連填寫問卷的連結都不再渲染——文件抱怨的正是這個。
 * 現在：有未完成事項時先問一次；沒有的話行為跟以前一樣，不多一道手續。
 *
 * 用行內確認而不是 window.confirm：這頁在平板上也會用，原生對話框在觸控上很容易誤按。
 */
export default function MarkScheduleDoneButton({
  caseId,
  itemId,
  pendingWarnings,
}: {
  caseId: string;
  itemId: string;
  /** 例：["問卷（SF-36 健康調查簡表）", "拍照"]。空陣列＝沒有東西擋著 */
  pendingWarnings: string[];
}) {
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const fd = new FormData();
    fd.set("case_id", caseId);
    fd.set("item_id", itemId);
    fd.set("status", "done");
    await markScheduleItemAction(fd);
    // 成功的話這個元件會隨著頁面重新渲染而消失，不用收尾
    setSaving(false);
    setConfirming(false);
  }

  if (confirming) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 rounded border border-amber-300 bg-amber-50 px-2 py-1">
        <span className="text-xs text-amber-900">{pendingWarnings.join("、")}還沒完成，確定標完成？</span>
        <button type="button" onClick={() => setConfirming(false)} className="text-xs text-ink/50 underline">
          取消
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="rounded bg-amber-600 px-2 py-0.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {saving ? "處理中…" : "確定"}
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => (pendingWarnings.length > 0 ? setConfirming(true) : void submit())}
      disabled={saving}
      className="whitespace-nowrap px-1.5 py-0.5 text-sm text-brand-700 underline disabled:opacity-60"
    >
      {saving ? "處理中…" : "標記完成"}
    </button>
  );
}
