import type { Metadata, Viewport } from "next";
import { Fraunces, Noto_Sans_TC } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const sans = Noto_Sans_TC({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "課序",
  description: "把課程、作業、考試與讀書進度收成一條清楚的時間線。",
  appleWebApp: {
    capable: true,
    title: "課序",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#e9eef2",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className={`${display.variable} ${sans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans text-ink">{children}</body>
    </html>
  );
}
