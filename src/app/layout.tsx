import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/lib/supabase/AuthProvider";
import TabBar from "@/components/TabBar";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
  ),
  title: "피그맵 - 착한가게 꿀꿀 지도",
  description: "광고는 구매하는 게 아니라 획득하는 것. 내 주변 착한가격업소를 AI와 함께.",
  openGraph: {
    title: "피그맵 - 착한가게 꿀꿀 지도",
    description: "광고는 구매하는 게 아니라 획득하는 것. 내 주변 착한가격업소를 AI와 함께.",
    type: "website",
    locale: "ko_KR",
  },
  appleWebApp: {
    capable: true,
    title: "피그맵",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#F97316",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          {children}
          <TabBar />
        </AuthProvider>
      </body>
    </html>
  );
}
