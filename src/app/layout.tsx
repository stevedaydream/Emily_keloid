import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "蟹足腫研究資料收集平台",
  description: "Keloid Research Data Collection Platform (Demo)",
};

const NAV_LINKS = [
  { href: "/", label: "個案列表" },
  { href: "/dashboard", label: "統計儀表板" },
  { href: "/cases/new", label: "新增個案" },
  { href: "/admin", label: "後台管理" },
  { href: "/export", label: "資料匯出" },
];

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        {session === "ok" && operator && (
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
              <div className="flex items-center gap-6">
                <span className="text-sm font-semibold">蟹足腫研究平台</span>
                <nav className="flex gap-4 text-sm text-slate-600">
                  {NAV_LINKS.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="hover:text-slate-900"
                    >
                      {l.label}
                    </Link>
                  ))}
                </nav>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <span>
                  目前操作者：<b className="text-slate-800">{operator}</b>
                </span>
                <Link
                  href={`/operator?next=${encodeURIComponent("/")}`}
                  className="text-slate-400 underline hover:text-slate-700"
                >
                  切換
                </Link>
              </div>
            </div>
          </header>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
