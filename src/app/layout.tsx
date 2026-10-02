import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getCurrentUser } from "@/lib/session.ts";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Backstage",
  description: "Los eventos, setlists y repartos de tu banda en un solo lugar.",
};

// The theme is rendered here, so the first paint is already right. Signed-out
// pages follow the OS.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = (await getCurrentUser())?.theme ?? "system";
  return (
    <html
      lang="es"
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
