"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pdfToImageBlobs } from "@/lib/pdf";
import { streamNdjson } from "@/lib/streamNdjson";
import { cleanOcrText } from "@/lib/cleanOcrText";
import { parseLayoutBlocks } from "@/lib/parseLayout";
import { buildTxt, buildExport, type ExportFormat, type ExportPage } from "@/lib/exporters";
import { StructuredBlocks } from "@/components/StructuredBlocks";
import { LayoutOverlay } from "@/components/LayoutOverlay";

type Mode = "gundam" | "base";
type PageStatus = "queued" | "running" | "done" | "error";
type ViewMode = "text" | "structured" | "layout";

type Page = {
  id: string;
  blob: Blob;
  previewUrl: string;
  sourceLabel: string;
  text: string;
  rawText: string;
  status: PageStatus;
  statusMessage: string;
  elapsedMs: number;
};

type RunState = "idle" | "preparing" | "running" | "done" | "error";

const PROMPT_PRESETS = ["document parsing.", "free OCR.", "OCR:"];
const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
const VIEWS: { id: ViewMode; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "structured", label: "Structured" },
  { id: "layout", label: "Layout" },
];
const EXPORT_FORMATS: { format: ExportFormat; label: string }[] = [
  { format: "txt", label: "Plain text (.txt)" },
  { format: "md", label: "Markdown (.md)" },
  { format: "docx", label: "Word (.docx)" },
  { format: "pdf", label: "PDF (.pdf)" },
  { format: "json", label: "Structured JSON (.json)" },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function toExportPages(pages: Page[]): ExportPage[] {
  return pages.map((p) => ({ sourceLabel: p.sourceLabel, text: p.text, rawText: p.rawText }));
}

async function runOcrOnPage(
  page: Page,
  mode: Mode,
  prompt: string,
  signal: AbortSignal,
  onUpdate: (patch: Partial<Page>) => void,
) {
  onUpdate({ status: "running", statusMessage: "Connecting…", text: "", rawText: "" });
  const startedAt = Date.now();

  const form = new FormData();
  form.append("file", page.blob, "page.png");
  form.append("mode", mode);
  form.append("prompt", prompt);

  // The final "done" event replaces the stream with the model's cleaned
  // save-file text, which has already had its <|det|> layout markers
  // stripped. Keep the last chunk that *had* markers around separately, so
  // the structured/layout views still have something to parse afterwards.
  let lastRawWithMarkup = "";

  try {
    const res = await fetch("/api/ocr", { method: "POST", body: form, signal });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `Request failed (${res.status}).`);
    }

    for await (const event of streamNdjson(res)) {
      if (event.type === "status") {
        onUpdate({ statusMessage: event.message });
      } else if (event.type === "token") {
        if (!event.done) lastRawWithMarkup = event.text;
        onUpdate({
          text: cleanOcrText(event.text),
          rawText: lastRawWithMarkup || event.text,
          elapsedMs: Date.now() - startedAt,
        });
      } else if (event.type === "error") {
        throw new Error(event.message);
      }
    }

    onUpdate({ status: "done", statusMessage: "Done", elapsedMs: Date.now() - startedAt });
  } catch (err) {
    if (signal.aborted) return;
    onUpdate({
      status: "error",
      statusMessage: err instanceof Error ? err.message : "Something went wrong.",
      elapsedMs: Date.now() - startedAt,
    });
    throw err;
  }
}

export function OcrTester() {
  const [pages, setPages] = useState<Page[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [view, setView] = useState<ViewMode>("text");
  const [mode, setMode] = useState<Mode>("gundam");
  const [prompt, setPrompt] = useState(PROMPT_PRESETS[0]);
  const [runState, setRunState] = useState<RunState>("idle");
  const [prepareMessage, setPrepareMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [sourceSummary, setSourceSummary] = useState("");
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      pages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!downloadMenuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!downloadMenuRef.current?.contains(e.target as Node)) {
        setDownloadMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [downloadMenuOpen]);

  const updatePage = useCallback((id: string, patch: Partial<Page>) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    abortRef.current?.abort();
    setPages((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    setActiveIndex(0);
    setView("text");
    setRunState("preparing");

    const newPages: Page[] = [];
    try {
      for (const file of files) {
        let blobs: Blob[];
        if (file.type === "application/pdf") {
          setPrepareMessage(
            files.length > 1 ? `Splitting ${file.name}…` : "Splitting PDF into pages…",
          );
          blobs = await pdfToImageBlobs(file);
          if (blobs.length === 0) throw new Error(`Couldn't read any pages from ${file.name}.`);
        } else {
          blobs = [file];
        }
        blobs.forEach((blob, i) => {
          newPages.push({
            id: uid(),
            blob,
            previewUrl: URL.createObjectURL(blob),
            sourceLabel: blobs.length > 1 ? `${file.name} · page ${i + 1}` : file.name,
            text: "",
            rawText: "",
            status: "queued",
            statusMessage: "Waiting…",
            elapsedMs: 0,
          });
        });
      }

      setPages(newPages);
      setSourceSummary(
        files.length === 1
          ? files[0].name
          : `${files.length} files · ${newPages.length} page${newPages.length === 1 ? "" : "s"}`,
      );
      setRunState("idle");
    } catch (err) {
      newPages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPrepareMessage(err instanceof Error ? err.message : "Couldn't read one of those files.");
      setRunState("error");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length) handleFiles(files);
    },
    [handleFiles],
  );

  const run = useCallback(async () => {
    if (pages.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunState("running");

    let hadError = false;
    for (let i = 0; i < pages.length; i++) {
      if (controller.signal.aborted) break;
      const page = pages[i];
      setActiveIndex(i);
      try {
        await runOcrOnPage(page, mode, prompt.trim() || "document parsing.", controller.signal, (patch) =>
          updatePage(page.id, patch),
        );
      } catch {
        // One page failing (a shared, free GPU can be flaky) shouldn't stop
        // the rest of the batch — keep going and let the user retry just
        // the pages that failed.
        hadError = true;
      }
    }
    if (!controller.signal.aborted) {
      setRunState(hadError ? "error" : "done");
    }
  }, [pages, mode, prompt, updatePage]);

  const retryPage = useCallback(
    async (id: string) => {
      const page = pages.find((p) => p.id === id);
      if (!page) return;
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await runOcrOnPage(page, mode, prompt.trim() || "document parsing.", controller.signal, (patch) =>
          updatePage(id, patch),
        );
      } catch {
        // status already reflects the failure via onUpdate
      }
    },
    [pages, mode, prompt, updatePage],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setPages((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    setRunState("idle");
    setSourceSummary("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const combinedText = useMemo(() => buildTxt(toExportPages(pages)), [pages]);

  const download = useCallback(
    async (format: ExportFormat) => {
      setExportingFormat(format);
      try {
        const { content, mime, ext } = await buildExport(format, toExportPages(pages));
        const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const base =
          (sourceSummary || "citrus-ocr").replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-") ||
          "citrus-ocr";
        a.href = url;
        a.download = `${base}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
      } finally {
        setExportingFormat(null);
        setDownloadMenuOpen(false);
      }
    },
    [pages, sourceSummary],
  );

  const copy = useCallback(() => {
    navigator.clipboard.writeText(combinedText).catch(() => {});
  }, [combinedText]);

  const active = pages[activeIndex];
  const activeBlocks = useMemo(
    () => (active ? parseLayoutBlocks(active.rawText) : []),
    [active],
  );
  const isBusy = runState === "running" || runState === "preparing";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      {/* Left: input controls */}
      <div className="flex flex-col gap-5">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
            dragActive
              ? "border-citrus-pink bg-citrus-pink-soft"
              : "border-border bg-surface hover:border-citrus-pink/60"
          }`}
        >
          <svg
            aria-hidden
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            className="text-citrus-pink"
          >
            <path
              d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="font-medium">
            {sourceSummary || "Drop images or PDFs here, or click to browse"}
          </p>
          <p className="text-sm text-foreground-muted">
            PNG, JPG, WEBP or PDF · multiple files at once · up to 20MB/page
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) handleFiles(files);
            }}
          />
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <label className="mb-2 block text-sm font-semibold">Mode</label>
          <div className="flex gap-2">
            {(["gundam", "base"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                  mode === m
                    ? "border-citrus-pink bg-citrus-pink text-white"
                    : "border-border bg-transparent hover:border-citrus-pink/60"
                }`}
              >
                {m}
                <span className="block text-xs font-normal opacity-80">
                  {m === "gundam" ? "fast · 640px crop" : "accurate · 1024px"}
                </span>
              </button>
            ))}
          </div>

          <label className="mt-5 mb-2 block text-sm font-semibold" htmlFor="prompt">
            Prompt
          </label>
          <input
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-citrus-pink"
            placeholder="document parsing."
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PROMPT_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPrompt(p)}
                className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-foreground-muted hover:text-citrus-pink"
              >
                {p}
              </button>
            ))}
          </div>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={run}
              disabled={pages.length === 0 || isBusy}
              className="flex-1 rounded-xl bg-citrus-pink px-4 py-2.5 font-semibold text-white transition-colors hover:bg-citrus-pink-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isBusy ? "Running…" : "Run OCR"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={pages.length === 0 && runState === "idle"}
              className="rounded-xl border border-border px-4 py-2.5 font-medium text-foreground-muted transition-colors hover:border-citrus-pink hover:text-citrus-pink disabled:opacity-40"
            >
              Clear
            </button>
          </div>

          {runState === "preparing" && (
            <p className="mt-3 flex items-center gap-2 text-sm text-foreground-muted">
              <span className="citrus-pulse h-2 w-2 rounded-full bg-citrus-teal" />
              {prepareMessage}
            </p>
          )}
          {runState === "error" && pages.length === 0 && (
            <p className="mt-3 text-sm text-citrus-pink">{prepareMessage}</p>
          )}
        </div>

        <p className="text-xs leading-relaxed text-foreground-muted">
          Citrus OCR runs on shared cloud GPUs, so the first request can take a
          minute to spin up, and busy periods may briefly queue.
        </p>
      </div>

      {/* Right: results */}
      <div className="flex min-h-[28rem] flex-col rounded-2xl border border-border bg-surface">
        {pages.length > 1 && (
          <div className="flex gap-1 overflow-x-auto border-b border-border p-2">
            {pages.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setActiveIndex(i)}
                title={p.sourceLabel}
                className={`flex max-w-[10rem] shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  i === activeIndex
                    ? "bg-citrus-pink-soft text-citrus-pink"
                    : "text-foreground-muted hover:bg-surface-muted"
                }`}
              >
                <StatusDot status={p.status} />
                <span className="truncate">{p.sourceLabel}</span>
              </button>
            ))}
          </div>
        )}

        {!active ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-foreground-muted">
            Extracted text will stream in here once you run OCR on a page.
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <StatusDot status={active.status} />
                <span className="text-foreground-muted">
                  {active.statusMessage}
                  {active.elapsedMs > 0 ? ` · ${(active.elapsedMs / 1000).toFixed(1)}s` : ""}
                </span>
              </div>
              <div className="flex gap-2">
                {active.status === "error" && (
                  <button
                    onClick={() => retryPage(active.id)}
                    disabled={isBusy}
                    className="rounded-lg border border-citrus-pink px-2.5 py-1 text-xs font-medium text-citrus-pink transition-colors hover:bg-citrus-pink-soft disabled:opacity-40"
                  >
                    Retry page
                  </button>
                )}
                <button
                  onClick={copy}
                  disabled={!combinedText}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground-muted transition-colors hover:border-citrus-pink hover:text-citrus-pink disabled:opacity-40"
                >
                  Copy all
                </button>
                <div className="relative" ref={downloadMenuRef}>
                  <button
                    onClick={() => setDownloadMenuOpen((v) => !v)}
                    disabled={!combinedText || exportingFormat !== null}
                    aria-haspopup="menu"
                    aria-expanded={downloadMenuOpen}
                    className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground-muted transition-colors hover:border-citrus-pink hover:text-citrus-pink disabled:opacity-40"
                  >
                    {exportingFormat ? "Preparing…" : "Download"}
                    <svg
                      aria-hidden
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      className={`transition-transform ${downloadMenuOpen ? "rotate-180" : ""}`}
                    >
                      <path
                        d="M6 9l6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  {downloadMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 z-10 mt-1.5 w-48 overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
                    >
                      {EXPORT_FORMATS.map(({ format, label }) => (
                        <button
                          key={format}
                          role="menuitem"
                          onClick={() => download(format)}
                          className="block w-full px-3 py-2 text-left text-xs font-medium text-foreground-muted transition-colors hover:bg-surface-muted hover:text-citrus-pink"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 border-b border-border px-3 py-2">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    view === v.id
                      ? "bg-citrus-pink text-white"
                      : "text-foreground-muted hover:bg-surface-muted"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            {view === "text" && (
              <pre className="flex-1 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-sm leading-relaxed">
                {active.text || (active.status === "running" ? "" : "—")}
                {active.status === "running" && (
                  <span className="citrus-pulse ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 bg-citrus-teal" />
                )}
              </pre>
            )}
            {view === "structured" && (
              <div className="flex-1 overflow-auto">
                <StructuredBlocks blocks={activeBlocks} />
              </div>
            )}
            {view === "layout" && (
              <div className="flex-1 overflow-auto">
                <LayoutOverlay imageUrl={active.previewUrl} blocks={activeBlocks} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: PageStatus }) {
  const color =
    status === "done"
      ? "bg-citrus-teal"
      : status === "error"
        ? "bg-citrus-pink"
        : status === "running"
          ? "bg-citrus-teal citrus-pulse"
          : "bg-foreground-muted/40";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
}
