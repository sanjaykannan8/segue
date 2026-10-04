import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "@/components/arc/foundation.css";
import "./segue-theme.css";
import "./globals.css";
import { ToastProvider } from "@/components/segue/toasts";
import { I18nProvider } from "@/lib/i18n";

// Self-hosted at build time by next/font, so nothing is fetched from a CDN when the page loads.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-jakarta" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], display: "swap", variable: "--font-mono-jb" });

export const metadata: Metadata = {
  description: "Segue watches your connection at Dubai International and tells you where to go.",
  icons: { icon: "/segue-logo.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F1F5F8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${mono.variable}`}>
      <body>
        <I18nProvider><ToastProvider>{children}</ToastProvider></I18nProvider>
      </body>
    </html>
  );
}
