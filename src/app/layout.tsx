import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getSession } from "./actions/auth";
import { getPendingReviewCount } from "./actions/review";
import { getReminderOverview } from "./actions/reminder";
import TopNav from "./TopNav";
import { getCurrentLocale } from "@/lib/locale";
import ReminderOverview from "@/components/ReminderOverview";

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
  title: "SK11 Finance",
  description: "SK11 finance management system",
  applicationName: "SK11 Finance",
};

export const viewport: Viewport = {
  themeColor: "#0B1736",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const locale = await getCurrentLocale();
  let pendingCount = 0;
  let reminderOverview = { contracts: [], activities: [], contractCount: 0, activityCount: 0 };
  if (session?.isAdmin) {
    pendingCount = await getPendingReviewCount();
  }
  if (session) {
    reminderOverview = await getReminderOverview();
  }
  
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#F2F2F7]">
        {session && (
          <div className="max-w-4xl mx-auto w-full px-4 sm:px-0 sm:pt-2">
            <TopNav
              session={session}
              pendingCount={pendingCount}
              contractReminderCount={reminderOverview.contractCount}
              activityReminderCount={reminderOverview.activityCount}
              locale={locale}
            />
          </div>
        )}
        {session && (
          <ReminderOverview
            locale={locale}
            contracts={reminderOverview.contracts}
            activities={reminderOverview.activities}
          />
        )}
        <div className="flex-1 max-w-4xl mx-auto w-full px-4 pb-10 mobile-safe-pb sm:px-0 sm:pb-10">
          {children}
        </div>
      </body>
    </html>
  );
}
