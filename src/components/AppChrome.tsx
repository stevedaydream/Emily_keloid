"use client";

import { usePathname } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import BackToTopButton from "@/components/BackToTopButton";
import type { LandingMode } from "@/lib/operator";

/** 病人自填頁是要交到病人手上的全螢幕介面：不掛導覽列、不套內距。 */
function isKioskPath(pathname: string): boolean {
  return /^\/patient\/[^/]+\/intake(\/|$)/.test(pathname);
}

/**
 * 決定「這一頁要不要有導覽列」的地方（2026-07-29 修正）。
 *
 * 原本這個判斷寫在 root layout（伺服器端，靠 proxy 塞的 x-pathname）。問題是 App Router
 * **不會在客戶端導航時重新渲染 root layout**，只會換掉變動的 segment，於是：
 *   - 從病人自填頁按「診間人員 → 回個案頁」，導覽列不會回來，要手動重新整理；
 *   - 更糟的是反方向——從個案頁按「交給病人填」，導覽列會**繼續留著**，
 *     等於把帶著完整導覽的平板交到病人手上。
 * 改成客戶端用 usePathname 判斷，每次導航都會重算，兩個方向都正確。
 *
 * initialPathname 是伺服器端算好的值，只當 SSR 的保險（usePathname 在極少數情況可能為 null），
 * 確保首次渲染的 HTML 就是對的，不會閃一下導覽列。
 */
export default function AppChrome({
  operator,
  landingMode,
  initialPathname,
  children,
}: {
  operator: string | null;
  landingMode: LandingMode;
  initialPathname: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? initialPathname;
  const kiosk = isKioskPath(pathname);

  return (
    <>
      {operator && !kiosk && <AppHeader operator={operator} landingMode={landingMode} />}
      <main className={kiosk ? "flex-1" : "mx-auto w-full max-w-6xl flex-1 px-4 py-6"}>{children}</main>
      {!kiosk && <BackToTopButton />}
    </>
  );
}
