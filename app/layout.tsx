import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maybank Regulatory Radar",
  description: "On-demand monitoring of Bank Negara Malaysia regulatory sources.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
