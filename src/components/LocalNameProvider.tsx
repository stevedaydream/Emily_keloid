"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getConfiguredHandle, readAllRows } from "@/lib/localMrnStore";

// 病人姓名只存在本機對照表檔案裡（決策 #1：雲端只有研究編號）。
// 這個 Provider 在瀏覽器端把本機 CSV 讀成 research_id -> 姓名 的對照，供各頁面注入畫面；
// 伺服器端渲染的 HTML 永遠只有研究編號，沒有掛對照表的電腦也就看不到任何姓名。
// 「顯示姓名」開關存在 localStorage，供投影或有訪客時一鍵隱藏。

const SHOW_NAMES_KEY = "keloid_show_names";

type LocalNameContextValue = {
  /** research_id -> 姓名（沒有對照表時是空 Map） */
  names: Map<string, string>;
  /** 對照表是否已連結 */
  linked: boolean;
  /** 使用者是否選擇顯示姓名 */
  showNames: boolean;
  toggleShowNames: () => void;
  /** 重新讀取本機檔案（新增個案寫入後呼叫） */
  reload: () => Promise<void>;
};

const LocalNameContext = createContext<LocalNameContextValue>({
  names: new Map(),
  linked: false,
  showNames: true,
  toggleShowNames: () => {},
  reload: async () => {},
});

export function LocalNameProvider({ children }: { children: React.ReactNode }) {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [linked, setLinked] = useState(false);
  const [showNames, setShowNames] = useState(true);

  const reload = useCallback(async () => {
    try {
      const handle = await getConfiguredHandle();
      if (!handle) {
        setLinked(false);
        setNames(new Map());
        return;
      }
      // 這裡刻意不呼叫 requestPermission：權限提示只能在使用者手勢中彈出，
      // 頁面載入時若權限尚未授予就安靜地當作沒有對照表（使用者到對照表頁按一次即可恢復）。
      const rows = await readAllRows(handle);
      setLinked(true);
      setNames(new Map(rows.filter((r) => r.name?.trim()).map((r) => [r.research_id.trim(), r.name.trim()])));
    } catch {
      setLinked(false);
      setNames(new Map());
    }
  }, []);

  useEffect(() => {
    setShowNames(window.localStorage.getItem(SHOW_NAMES_KEY) !== "0");
    void reload();
  }, [reload]);

  const toggleShowNames = useCallback(() => {
    setShowNames((prev) => {
      const next = !prev;
      window.localStorage.setItem(SHOW_NAMES_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ names, linked, showNames, toggleShowNames, reload }),
    [names, linked, showNames, toggleShowNames, reload]
  );

  return <LocalNameContext.Provider value={value}>{children}</LocalNameContext.Provider>;
}

export function useLocalNames() {
  return useContext(LocalNameContext);
}

/** 顯示某研究編號對應的姓名；沒有對照表、查無姓名或使用者關閉顯示時，什麼都不輸出。 */
export default function PatientName({
  researchId,
  className = "",
  prefix = "",
}: {
  researchId: string;
  className?: string;
  prefix?: string;
}) {
  const { names, showNames } = useLocalNames();
  if (!showNames) return null;
  const name = names.get(researchId?.trim());
  if (!name) return null;
  return (
    <span className={className}>
      {prefix}
      {name}
    </span>
  );
}
