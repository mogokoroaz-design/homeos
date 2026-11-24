import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "HomeOS", template: "%s · HomeOS" },
  description: "Local-first household and personal operating system",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "HomeOS", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#0b0c0e", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
