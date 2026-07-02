import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jbmono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Provify — Prove you built it",
  description:
    "An AI technical interviewer that reads your actual code and asks questions only someone who built it could answer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jbmono.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-bg text-text antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
