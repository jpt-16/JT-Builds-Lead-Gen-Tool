import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Same typeface as jtbuildsco.com; heavier weights for the data-dense workspace.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "JT Builds Co Lead Engine",
  description: "Private lead finder and call list for JT Builds Co.",
  // Private tool: keep it out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#f4f5f8", colorScheme: "light" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
