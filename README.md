# Citrus OCR

Turn any photo, scan, or multi-page PDF into clean, structured text — instantly, right in your browser.

Citrus OCR reads documents in real time, streaming results back token by token, and understands their structure — titles, paragraphs, and tables — instead of just dumping a wall of text. No installs, no accounts, no GPU of your own.

## Features

- **Any format, in bulk** — images (PNG, JPG, WEBP) or multi-page PDFs, several files at once
- **Real-time streaming** — watch the text appear as it's read, instead of waiting on a spinner
- **Layout detection** — see exactly which regions were read as a title, paragraph, table, or figure, drawn right on the page
- **Structured view** — tables render as real tables, not flattened text
- **Two modes** — fast for quick scans, accurate for dense or detailed pages
- **Custom prompts** — steer what gets extracted
- **Export anywhere** — Word (`.docx`), PDF, Markdown, structured JSON, or plain text
- **Retry per page** — a flaky page doesn't cost you the rest of the batch

## Getting started

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

### Optional: your own GPU quota

Citrus OCR runs against a shared, free community GPU. That quota is pooled across every anonymous caller — including everyone else hitting it from the same hosting provider — so it can occasionally report that it's busy.

To get a dedicated quota instead, create a free token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) and set it as an environment variable:

```bash
HF_TOKEN=hf_your_token_here
```

This is optional — Citrus OCR works without it, just with less headroom during busy periods.

## About

Citrus OCR is built and maintained by **Citrus Global**, powered by long-horizon OCR research technology running on shared cloud GPUs — which is why the first request of the day can take a little longer to spin up.

MIT licensed. See [LICENSE](./LICENSE).
