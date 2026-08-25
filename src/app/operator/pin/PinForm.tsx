"use client";

import { useActionState } from "react";
import { verifyAdminPinAction, type PinFormState } from "../actions";
import SubmitButton from "@/components/ui/SubmitButton";

export default function PinForm({ name, next }: { name: string; next: string }) {
  const [state, formAction] = useActionState<PinFormState, FormData>(verifyAdminPinAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="next" value={next} />
      <input
        name="pin"
        type="password"
        // 平板／手機上直接跳數字鍵盤；PIN 本來就只有數字
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        placeholder="請輸入 PIN"
        className="w-full rounded-md border border-brand-200 px-3 py-2 text-center text-lg tracking-[0.4em]"
      />
      {state?.error && <p className="rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">{state.error}</p>}
      <SubmitButton className="w-full" pendingText="驗證中…">
        確認
      </SubmitButton>
    </form>
  );
}
