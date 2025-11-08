import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nidalheim - Documentation",
  description: "Documentation for Nidalheim development",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
