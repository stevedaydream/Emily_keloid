import type { Metadata } from "next";
import { Noto_Serif_TC, Noto_Sans_TC, IBM_Plex_Mono } from "next/font/google";
import { cookies } from "next/headers";
import AppHeader from "@/components/AppHeader";
import BackToTopButton from "@/components/BackToTopButton";
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

  return (
    <html
      lang="zh-Hant"
      className={`${notoSerifTC.variable} ${notoSansTC.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-body text-ink">
        {session === "ok" && operator && <AppHeader operator={operator} />}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          {children}
        </main>
        <BackToTopButton />
      </body>
    </html>
  );
}
