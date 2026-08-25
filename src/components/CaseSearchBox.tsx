"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

// 搜尋框。
//
// 2026-08-25 起病歷號與姓名存在資料庫（`cases.mrn` / `cases.patient_name`），
// 所以直接把關鍵字送去伺服器查就好——原本要先在瀏覽器讀本機對照表、把病歷號換成研究編號
// 再送出的那一段整個不需要了（那也是為什麼沒掛對照表的裝置搜不到病歷號）。
export default function CaseSearchBox({
  defaultValue = "",
  redirectTo = "/cases",
  placeholder = "搜尋研究編號 / 醫師 / 部位 / 病歷號 / 姓名",
}: {
  defaultValue?: string;
  redirectTo?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `${redirectTo}?q=${encodeURIComponent(q)}` : redirectTo);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full min-w-0 rounded-md border border-brand-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500 sm:w-64"
      />
      <Button type="submit" variant="outline" size="sm">
        搜尋
      </Button>
    </form>
  );
}
