import type { Metadata } from "next";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";

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
        className="overflow-hidden bg-black text-white"
        suppressHydrationWarning={process.env.NODE_ENV === "development"}
      >
        {children}
      </body>
    </html>
  );
}
