import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Same typeface as jtbuildsco.com. Weights capped at 500, as on the site.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "JT Builds Co Lead Engine",
  description: "Private lead finder and call list for JT Builds Co.",
  // Private tool: keep it out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#161826", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
