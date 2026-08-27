import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { OcrTester } from "@/components/OcrTester";

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="mb-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-citrus-teal-soft px-3 py-1 text-xs font-semibold text-citrus-teal">
            <span className="h-1.5 w-1.5 rounded-full bg-citrus-teal" />
            Live model, real inference
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
            <span className="text-citrus-pink">Citrus OCR</span> reads any
            document, instantly
          </h1>
          <p className="mt-3 text-foreground-muted">
            Drop in photos, scans, or multi-page PDFs — even several at once —
            and watch them turn into clean text token by token. See the exact
            layout it detected, then export to Word, PDF, Markdown, or
            structured JSON.
          </p>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-foreground-muted">
            <Feature>Batch upload</Feature>
            <Feature>Live layout detection</Feature>
            <Feature>Word &amp; PDF export</Feature>
            <Feature>No install required</Feature>
          </ul>
        </div>
        <OcrTester />
      </main>
      <Footer />
    </>
  );
}

function Feature({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="h-1 w-1 rounded-full bg-citrus-pink" aria-hidden />
      {children}
    </li>
  );
}
