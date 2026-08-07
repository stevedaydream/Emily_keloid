"use client";

import { useState } from "react";
import { patientBindQrAction } from "./actions";

// 填完問卷的最後一頁順手綁 LINE。病人手機就在手上、人也還在，是最容易完成綁定的時機
// （回家後才想加好友，通常就不會做了）。
//
// 版面沿用病人版的老年友善規格：大按鈕、大字級、一次只做一件事。
export default function LineBindPrompt({ caseId }: { caseId: string }) {
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "bound" } | { kind: "ready"; code: string; qr: string | null } | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleClick() {
    setState({ kind: "loading" });
    const res = await patientBindQrAction(caseId);
    if (res.state === "bound") setState({ kind: "bound" });
    else if (res.state === "ready") setState({ kind: "ready", code: res.code, qr: res.qrDataUrl });
    else setState({ kind: "error", message: res.message });
  }

  if (state.kind === "bound") {
    return (
      <p className="mt-8 rounded-2xl bg-emerald-50 px-5 py-4 text-lg text-emerald-800">
        您已完成 LINE 提醒設定，回診前會收到通知。
      </p>
    );
  }

  if (state.kind === "ready") {
    return (
      <div className="mt-8 rounded-2xl border border-brand-100 bg-white px-5 py-5">
        <p className="text-xl font-medium text-ink">要收到回診提醒嗎？</p>
        {state.qr ? (
          <>
            <p className="mt-2 text-lg leading-relaxed text-ink/70">
              請用手機的 LINE 掃描下面這個圖案，
              <br />
              畫面會自動帶出一段文字，按「送出」就完成了。
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.qr}
              alt="LINE 綁定 QR code"
              className="mx-auto mt-4 h-56 w-56 rounded-lg border border-brand-100"
            />
          </>
        ) : (
          <p className="mt-2 text-lg leading-relaxed text-ink/70">
            請加入診間的 LINE 官方帳號後，在對話框輸入下面這組號碼：
          </p>
        )}
        <p className="mt-4 text-center font-data text-4xl font-medium tracking-widest text-brand-900">{state.code}</p>
        <p className="mt-3 text-base text-ink/50">若現在不方便，也可以請診間人員協助。</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return <p className="mt-8 text-lg text-red-600">{state.message}</p>;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state.kind === "loading"}
      className="mt-8 w-full rounded-2xl bg-brand-700 px-6 py-5 text-xl font-medium text-white disabled:opacity-60"
    >
      {state.kind === "loading" ? "產生中…" : "我要用 LINE 收回診提醒"}
    </button>
  );
}
