import TourViewer from "./TourViewer";

// 平台導覽（2026-07-29）。內容全部是靜態的，不查資料庫——
// 它描述的是「流程怎麼走」，不是「現在有幾筆資料」。
export const metadata = {
  title: "平台導覽｜蟹足腫研究資料收集平台",
};

export default function AboutPage() {
  return <TourViewer />;
}
