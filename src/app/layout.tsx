import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getSession } from "./actions/auth";
import { getPluginFlags } from "./actions/settings";
import { DEFAULT_PLUGIN_FLAGS } from "@/lib/plugins";
import { getCurrentLocale } from "@/lib/locale";
import AppChrome from "@/components/AppChrome";

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
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SK11",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B1736",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Session shell only — badge counts + reminder lists load client-side after paint
  // (see AppChrome / getChromeNavData) so navigations are not blocked on those queries.
  const [session, locale] = await Promise.all([getSession(), getCurrentLocale()]);
  const pluginFlags = session
    ? await getPluginFlags().catch(() => DEFAULT_PLUGIN_FLAGS)
    : DEFAULT_PLUGIN_FLAGS;

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#F2F2F7]">
        {session && (
          <AppChrome session={session} pluginFlags={pluginFlags} locale={locale} />
        )}
        <div className="flex-1 max-w-4xl mx-auto w-full px-4 pb-10 mobile-safe-pb sm:px-0 sm:pb-10">
          {children}
        </div>
      </body>
    </html>
  );
}
