import { redirect } from "next/navigation";

// 統計儀表板已搬到首頁（2026-07-27），這裡保留轉址避免舊書籤/連結失效。
export default function DashboardRedirectPage() {
  redirect("/");
}
