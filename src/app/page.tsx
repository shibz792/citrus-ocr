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
            Test Baidu&apos;s{" "}
            <span className="text-citrus-pink">Unlimited-OCR</span> in your browser
          </h1>
          <p className="mt-3 text-foreground-muted">
            One-shot, long-horizon document parsing. Drop in a photo, scan, or
            multi-page PDF and watch the model read it token by token — no
            install, no GPU of your own required.
          </p>
        </div>
        <OcrTester />
      </main>
      <Footer />
    </>
  );
}
