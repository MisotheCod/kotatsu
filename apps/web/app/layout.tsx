import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "Kotatsu",
  manifest: "/manifest.webmanifest",
  // iOS 26 keeps the status bar area white with "default" and there was no way to tint it, which left a
  // pale band above the clock on every screen. "black-translucent" makes the bar transparent on iOS 26 so
  // the page's own paper shows through, and light colour scheme keeps the clock and battery dark.
  appleWebApp: { capable: true, title: "Kotatsu", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, maximumScale: 1,
  // Cover again: the page has to reach the top edge so the transparent status bar shows our paper
  // rather than a white band. The header paints an opaque strip in that area so the system's fade has
  // only paper to work on.
  viewportFit: "cover",
  themeColor: "#f7f6f3",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lexend:wght@500;600&family=JetBrains+Mono:wght@400;500&display=swap" />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
