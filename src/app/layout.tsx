import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Citrus OCR — Unlimited-OCR tester",
  description:
    "A live testing interface for Baidu's Unlimited-OCR model, built by Citrus Global. Upload an image or PDF and watch one-shot, long-horizon document parsing stream in real time.",
  keywords: [
    "OCR",
    "Unlimited-OCR",
    "Baidu",
    "document parsing",
    "Citrus Global",
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
