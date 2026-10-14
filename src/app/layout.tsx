import type { Metadata, Viewport } from "next";
import "@/fonts/fonts.css";
import "./globals.css";
import { PwaRegister } from "./PwaRegister";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "ERA XI — Every era. One XI. Prove yours.",
  description: "A one-minute football draft. 11 club + era draws, one pick each, a 38-game season. Then challenge a friend on the same draw.",
  openGraph: {
    title: "ERA XI",
    description: "Every era. One XI. Prove yours.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "ERA XI", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#080A09",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
