import type { Metadata } from "next";
import { Noto_Serif_TC, Noto_Sans_TC, IBM_Plex_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import AppChrome from "@/components/AppChrome";
import { getCurrentOperatorContext } from "@/lib/operator";
import { isTestMode } from "@/lib/appSettings";
import { LocalNameProvider } from "@/components/LocalNameProvider";
import "./globals.css";

const notoSerifTC = Noto_Serif_TC({
  variable: "--font-noto-serif-tc",
  weight: ["500", "700"],
  subsets: ["latin"],
});

const notoSansTC = Noto_Sans_TC({
  variable: "--font-noto-sans-tc",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "蟹足腫研究資料收集平台",
  description: "Keloid Research Data Collection Platform (Demo)",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const session = cookieStore.get("keloid_session")?.value;
  const operator = cookieStore.get("keloid_operator")?.value;
  const signedIn = session === "ok" && Boolean(operator);

  // nav_compact 決定 header 要不要把非核心功能收進「更多」（見 lib/operator.ts）。
  // 這裡一律取得（不再依路徑跳過）——「要不要顯示導覽列」已移到 AppChrome 由客戶端判斷，
  // root layout 在客戶端導航時不會重新渲染，把判斷留在這裡會導致導覽列該消失時沒消失。
  const operatorContext = signedIn ? await getCurrentOperatorContext() : null;
  const pathname = (await headers()).get("x-pathname") ?? "";
  // 測試模式全站掛橫幅：正式與測試資料混在同一套系統裡，唯一能防呆的就是隨時看得見現在是哪一種
  const testMode = signedIn ? await isTestMode() : false;

  return (
    <html
      lang="zh-Hant"
      className={`${notoSerifTC.variable} ${notoSansTC.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-body text-ink">
        {/* 姓名只在瀏覽器端從本機對照表讀出後注入畫面，伺服器渲染的內容永遠不含姓名 */}
        <LocalNameProvider devMobileMapping={operatorContext?.devMobileMapping ?? false}>
          <AppChrome
            operator={operatorContext?.name ?? null}
            navCompact={operatorContext?.navCompact ?? false}
            initialPathname={pathname}
            testMode={testMode}
          >
            {children}
          </AppChrome>
        </LocalNameProvider>
      </body>
    </html>
  );
}
