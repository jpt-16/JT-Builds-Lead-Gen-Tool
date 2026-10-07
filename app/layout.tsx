import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JT Builds Co Lead Engine",
  description: "Private lead finder and call list for JT Builds Co.",
  // Private tool: keep it out of search engines.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
