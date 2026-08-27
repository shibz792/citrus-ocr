"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pdfToImageBlobs } from "@/lib/pdf";
import { streamNdjson } from "@/lib/streamNdjson";
import { cleanOcrText } from "@/lib/cleanOcrText";

type Mode = "gundam" | "base";
type PageStatus = "queued" | "running" | "done" | "error";

type Page = {
  id: string;
  blob: Blob;
  previewUrl: string;
  text: string;
  status: PageStatus;
  statusMessage: string;
  elapsedMs: number;
};

type RunState = "idle" | "preparing" | "running" | "done" | "error";

const PROMPT_PRESETS = ["document parsing.", "free OCR.", "OCR:"];
const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

async function runOcrOnPage(
  page: Page,
  mode: Mode,
  prompt: string,
  signal: AbortSignal,
  onUpdate: (patch: Partial<Page>) => void,
) {
  onUpdate({ status: "running", statusMessage: "Connecting…", text: "" });
  const startedAt = Date.now();

  const form = new FormData();
  form.append("file", page.blob, "page.png");
  form.append("mode", mode);
  form.append("prompt", prompt);

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
        onUpdate({ text: cleanOcrText(event.text), elapsedMs: Date.now() - startedAt });
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
  const [mode, setMode] = useState<Mode>("gundam");
  const [prompt, setPrompt] = useState(PROMPT_PRESETS[0]);
  const [runState, setRunState] = useState<RunState>("idle");
  const [prepareMessage, setPrepareMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [sourceName, setSourceName] = useState<string>("");

  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      pages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updatePage = useCallback((id: string, patch: Partial<Page>) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const handleFile = useCallback(async (file: File) => {
    abortRef.current?.abort();
    setPages((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    setActiveIndex(0);
    setSourceName(file.name);
    setRunState("preparing");

    try {
      let blobs: Blob[];
      if (file.type === "application/pdf") {
        setPrepareMessage("Splitting PDF into pages…");
        blobs = await pdfToImageBlobs(file);
        if (blobs.length === 0) throw new Error("Couldn't read any pages from that PDF.");
      } else {
        blobs = [file];
      }

      const newPages: Page[] = blobs.map((blob) => ({
        id: uid(),
        blob,
        previewUrl: URL.createObjectURL(blob),
        text: "",
        status: "queued",
        statusMessage: "Waiting…",
        elapsedMs: 0,
      }));
      setPages(newPages);
      setRunState("idle");
    } catch (err) {
      setPrepareMessage(err instanceof Error ? err.message : "Couldn't read that file.");
      setRunState("error");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const run = useCallback(async () => {
    if (pages.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunState("running");

    let hadError = false;
    for (const page of pages) {
      if (controller.signal.aborted) break;
      try {
        await runOcrOnPage(page, mode, prompt.trim() || "document parsing.", controller.signal, (patch) =>
          updatePage(page.id, patch),
        );
      } catch {
        hadError = true;
        break;
      }
    }
    if (!controller.signal.aborted) {
      setRunState(hadError ? "error" : "done");
    }
  }, [pages, mode, prompt, updatePage]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setPages((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    setRunState("idle");
    setSourceName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const combinedText = pages
    .map((p, i) => (pages.length > 1 ? `--- Page ${i + 1} ---\n${p.text}` : p.text))
    .join("\n\n")
    .trim();

  const download = useCallback(() => {
    const blob = new Blob([combinedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(sourceName || "ocr-result").replace(/\.[^.]+$/, "")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [combinedText, sourceName]);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(combinedText).catch(() => {});
  }, [combinedText]);

  const active = pages[activeIndex];
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
            {sourceName || "Drop an image or PDF here, or click to browse"}
          </p>
          <p className="text-sm text-foreground-muted">PNG, JPG, WEBP or PDF · up to 20MB/page</p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
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
          Runs against the public{" "}
          <a
            className="underline hover:text-citrus-pink"
            href="https://huggingface.co/spaces/baidu/Unlimited-OCR"
            target="_blank"
            rel="noreferrer"
          >
            baidu/Unlimited-OCR
          </a>{" "}
          Space on a shared ZeroGPU — first requests can take a minute to wake the
          model up, and busy periods may queue.
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
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  i === activeIndex
                    ? "bg-citrus-pink-soft text-citrus-pink"
                    : "text-foreground-muted hover:bg-surface-muted"
                }`}
              >
                <StatusDot status={p.status} />
                Page {i + 1}
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
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <StatusDot status={active.status} />
                <span className="text-foreground-muted">
                  {active.statusMessage}
                  {active.elapsedMs > 0 ? ` · ${(active.elapsedMs / 1000).toFixed(1)}s` : ""}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={copy}
                  disabled={!combinedText}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground-muted transition-colors hover:border-citrus-pink hover:text-citrus-pink disabled:opacity-40"
                >
                  Copy all
                </button>
                <button
                  onClick={download}
                  disabled={!combinedText}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground-muted transition-colors hover:border-citrus-pink hover:text-citrus-pink disabled:opacity-40"
                >
                  Download .txt
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-sm leading-relaxed">
              {active.text || (active.status === "running" ? "" : "—")}
              {active.status === "running" && (
                <span className="citrus-pulse ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 bg-citrus-teal" />
              )}
            </pre>
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
