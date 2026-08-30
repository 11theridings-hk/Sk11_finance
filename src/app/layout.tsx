import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getSession } from "./actions/auth";
import { getPendingReviewCount } from "./actions/review";
import TopNav from "./TopNav";
import { getCurrentLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FINNE18",
  description: "Finance Management System",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const locale = await getCurrentLocale();
  let pendingCount = 0;
  if (session?.isAdmin) {
    pendingCount = await getPendingReviewCount();
  }
  
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#F2F2F7]">
        {session && (
          <div className="max-w-4xl mx-auto w-full px-4 sm:px-0 sm:pt-2">
            <TopNav session={session} pendingCount={pendingCount} locale={locale} />
          </div>
        )}
        <div className="flex-1 max-w-4xl mx-auto w-full px-4 pb-10 mobile-safe-pb sm:px-0 sm:pb-10">
          {children}
        </div>
      </body>
    </html>
  );
}
