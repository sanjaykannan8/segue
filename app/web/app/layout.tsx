import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "@/components/arc/foundation.css";
import "./segue-theme.css";
import "./globals.css";
import { ToastProvider } from "@/components/segue/toasts";

const instrument = localFont({
  src: "./fonts/InstrumentSans.ttf",
  weight: "400 700",
  style: "normal",
  display: "swap",
  variable: "--font-instrument",
});

export const metadata: Metadata = {
  title: { default: "Segue", template: "%s · Segue" },
  description: "Segue watches your airport connection and tells you where to go.",
  icons: { icon: "/segue-logo.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#DFF6FF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={instrument.variable}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
