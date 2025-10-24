import type { Metadata } from "next";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
