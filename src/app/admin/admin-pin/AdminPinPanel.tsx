"use client";

import { useState, useTransition } from "react";
import { setAdminPinAction, clearAdminPinAction, type AdminPinResult } from "./actions";
import Button from "@/components/ui/Button";

const inputClass =
  "w-full rounded-md border border-brand-200 px-3 py-2 text-center text-lg tracking-[0.4em]";

export default function AdminPinPanel({ alreadySet }: { alreadySet: boolean }) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [result, setResult] = useState<AdminPinResult | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<AdminPinResult>) =>
    startTransition(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        setCurrentPin("");
        setNewPin("");
        setConfirmPin("");
      }
    });

  return (
    <div className="space-y-4 rounded-lg border border-brand-100 bg-paper-raised p-5">
      <div className="rounded-md bg-brand-50/60 px-3 py-2 text-xs text-ink/60">
        目前狀態：<b>{alreadySet ? "已設定 PIN" : "未設定（不會擋）"}</b>
        。demo／教育訓練期間可以先不設；正式上線那天再設一組即可生效。
      </div>

      {alreadySet && (
        <label className="block space-y-1">
          <span className="text-xs text-ink/60">目前的 PIN</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value)}
            className={inputClass}
          />
        </label>
      )}

      <label className="block space-y-1">
        <span className="text-xs text-ink/60">{alreadySet ? "新的 PIN" : "設定 PIN"}（4-8 位數字）</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={newPin}
          onChange={(e) => setNewPin(e.target.value)}
          className={inputClass}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-ink/60">再輸入一次</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          className={inputClass}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() => run(() => setAdminPinAction({ newPin, confirmPin, currentPin }))}
        >
          {pending ? "處理中…" : alreadySet ? "更換 PIN" : "設定 PIN"}
        </Button>
        {alreadySet && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(() => clearAdminPinAction({ currentPin }))}
          >
            取消 PIN
          </Button>
        )}
      </div>

      {result && (
        <p
          className={`rounded px-3 py-2 text-xs ${
            result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {result.ok ? result.message : result.error}
        </p>
      )}

      <p className="text-xs text-ink/40">
        忘記 PIN 沒有救援碼——請維運人員直接把 app_settings 裡的 admin_pin_hash 刪掉即可回到未設定狀態。
        （這跟匯出金鑰不同：匯出金鑰弄丟會拿不到資料，PIN 只是動線上的一道門。）
      </p>
    </div>
  );
}
