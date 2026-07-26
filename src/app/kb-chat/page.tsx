"use client";

import { useActionState } from "react";
import { askHealthEducationBotAction } from "./actions";

const initialState = { question: "", answer: "" };

export default function KbChatPage() {
  const [state, formAction, pending] = useActionState(askHealthEducationBotAction, initialState);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">衛教諮詢機器人（示範）</h1>
        <p className="mt-1 text-xs text-slate-400">
          僅回答後台衛教資料庫涵蓋的內容，不涉及病人個資，正式版將部署於 LINE 官方帳號。
        </p>
      </div>

      <form action={formAction} className="space-y-2">
        <textarea
          name="question"
          rows={2}
          placeholder="請輸入衛教相關問題，例如：傷口會癢怎麼辦？"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "詢問中…" : "送出"}
        </button>
      </form>

      {state.answer && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <p className="mb-2 text-slate-400">Q：{state.question}</p>
          <p className="whitespace-pre-wrap text-slate-800">{state.answer}</p>
        </div>
      )}
    </div>
  );
}
