import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "mapbox-gl/dist/mapbox-gl.css"
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "세계 라디오",
  description: "지구본에서 세계 라디오 방송국을 찾아 실시간으로 듣습니다.",
};

export default function RootLayout({
   children,
  }: Readonly<{
    children: React.ReactNode;
  }>) {
  return (
    <html lang="ko">
      <body
        className={`${inter.className} bg-black text-white overflow-hidden`}
        suppressHydrationWarning={process.env.NODE_ENV === "development"}
      >
        {children}
      </body>
    </html>
  );
}
