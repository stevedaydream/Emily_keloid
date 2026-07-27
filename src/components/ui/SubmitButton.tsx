"use client";

import { useFormStatus } from "react-dom";
import Button, { type ButtonProps } from "./Button";

// 放在 <form action={serverAction}> 裡面當送出鈕：會自動反映該表單真正的送出中狀態
// （呼叫 Supabase 的網路等待時間），不需要每個表單各自寫 useState 管理 loading。
export default function SubmitButton({ pendingText = "處理中…", children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" pending={pending} pendingText={pendingText} {...props}>
      {children}
    </Button>
  );
}
