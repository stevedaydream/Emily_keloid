"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// 姓名顯示開關。
//
// **2026-08-25 大幅簡化**：病人姓名改為明文存在 `cases.patient_name`（廢除本機對照表與
// 加密保管庫，見 NewCaseForm 頂端的說明）。所以這裡不再需要在瀏覽器端讀 CSV、
// 不再需要 research_id → 姓名 的記憶體對照，也沒有「有沒有掛對照表」這回事——
// 姓名由伺服器隨個案一起送過來，各頁面直接把它傳進 <PatientName name=... />。
//
// 保留下來的只有一件事：**「顯示姓名」開關**（存 localStorage）。
// 投影、教學、診間有訪客時一鍵把姓名藏起來，這個需求跟資料存在哪裡無關。

const SHOW_NAMES_KEY = "keloid_show_names";

type NameDisplayContextValue = {
  showNames: boolean;
  toggleShowNames: () => void;
};

const NameDisplayContext = createContext<NameDisplayContextValue>({
  showNames: true,
  toggleShowNames: () => {},
});

export function LocalNameProvider({ children }: { children: React.ReactNode }) {
  // 先以「顯示」渲染，掛載後才讀 localStorage：伺服器端沒有 localStorage，
  // 一開始就讀會造成 hydration 不一致。
  const [showNames, setShowNames] = useState(true);

  useEffect(() => {
    try {
      setShowNames(window.localStorage.getItem(SHOW_NAMES_KEY) !== "0");
    } catch {
      /* 隱私模式等讀不到 localStorage：維持預設顯示 */
    }
  }, []);

  const toggleShowNames = useCallback(() => {
    setShowNames((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SHOW_NAMES_KEY, next ? "1" : "0");
      } catch {
        /* 存不進去就只影響這一次工作階段，不是錯誤 */
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ showNames, toggleShowNames }), [showNames, toggleShowNames]);

  return <NameDisplayContext.Provider value={value}>{children}</NameDisplayContext.Provider>;
}

export function useLocalNames() {
  return useContext(NameDisplayContext);
}

/**
 * 顯示病歷號；沒有病歷號或使用者關閉顯示時，什麼都不輸出（2026-08-29）。
 *
 * 跟 PatientName 同一顆開關：病歷號的可識別度不比姓名低，只藏姓名的話那顆開關形同虛設
 * （使用者裁決）。所以導覽列那顆按鈕的字也從「姓名」改成「姓名／病歷號」。
 *
 * 用等寬字（font-data）：病歷號是要拿來跟手上的單子逐字對的，等寬比較不會看錯。
 */
export function PatientMrn({
  mrn,
  className = "",
  prefix = "",
}: {
  mrn?: string | null;
  className?: string;
  prefix?: string;
}) {
  const { showNames } = useLocalNames();
  if (!showNames) return null;
  const trimmed = mrn?.trim();
  if (!trimmed) return null;
  return (
    <span className={`font-data ${className}`}>
      {prefix}
      {trimmed}
    </span>
  );
}

/** 顯示病人姓名；沒有姓名或使用者關閉顯示時，什麼都不輸出。 */
export default function PatientName({
  name,
  className = "",
  prefix = "",
}: {
  /** 由伺服器隨個案帶下來的 `cases.patient_name` */
  name?: string | null;
  className?: string;
  prefix?: string;
}) {
  const { showNames } = useLocalNames();
  if (!showNames) return null;
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return (
    <span className={className}>
      {prefix}
      {trimmed}
    </span>
  );
}
