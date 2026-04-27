import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/Layout/Navigation";
import { Footer } from "@/components/Layout/Footer";
import { AuthProvider } from "@/lib/auth/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={
          {
            "--font-geist-sans": geistSans.style.fontFamily,
            "--font-geist-mono": geistMono.style.fontFamily,
          } as React.CSSProperties
        }
      >
        <AuthProvider>
          <div className="min-h-screen bg-background text-foreground">
            <Navigation />
            {children}
            <Footer />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
