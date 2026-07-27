"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getConfiguredHandle, readAllRows } from "@/lib/localMrnStore";

// 搜尋研究編號/醫師/部位可以直接送到伺服器查；但病歷號只存在本機對照表，
// 所以先在瀏覽器本機把病歷號換成研究編號，再用研究編號去查詢（跟新增個案頁同一套原則）。
export default function CaseSearchBox({
  defaultValue = "",
  redirectTo = "/cases",
  placeholder = "搜尋研究編號 / 醫師 / 部位 / 病歷號",
}: {
  defaultValue?: string;
  redirectTo?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [searching, setSearching] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) {
      router.push(redirectTo);
      return;
    }
    setSearching(true);
    try {
      let effective = q;
      const handle = await getConfiguredHandle();
      if (handle) {
        const rows = await readAllRows(handle);
        const hit = rows.find((r) => r.mrn.trim().toLowerCase() === q.toLowerCase());
        if (hit) effective = hit.research_id;
      }
      router.push(`${redirectTo}?q=${encodeURIComponent(effective)}`);
    } finally {
      setSearching(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full min-w-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:w-64"
      />
      <button
        type="submit"
        disabled={searching}
        className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
      >
        {searching ? "搜尋中…" : "搜尋"}
      </button>
    </form>
  );
}
