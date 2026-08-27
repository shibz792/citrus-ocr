# Citrus OCR

A live browser interface for testing [`baidu/Unlimited-OCR`](https://github.com/baidu/Unlimited-OCR) — Baidu's "one-shot, long-horizon" document parsing model. Drop in an image or a multi-page PDF and watch the extracted text stream in, token by token, straight from the real model.

Built and branded by **Citrus Global**.

## How it works

There's no local GPU and no self-hosted model here. This app is a thin, real client for the model's own public [Hugging Face Space](https://huggingface.co/spaces/baidu/Unlimited-OCR):

- A Next.js **Route Handler** (`src/app/api/ocr/route.ts`) opens a session against the Space via [`@gradio/client`](https://www.npmjs.com/package/@gradio/client), calls its `/run_ocr` endpoint, and relays the token stream back to the browser as newline-delimited JSON.
- PDFs are split into page images **in the browser** with [`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist), then each page is sent through the same single-image pipeline — one GPU call per page, matching the Space's own 60-second-per-call quota.
- `mode` (`gundam` = fast/640px, `base` = accurate/1024px) and the text `prompt` are passed straight through to the model, unchanged.

Because it's calling a shared, free ZeroGPU Space, expect a cold-start delay on the first request and possible queueing behind other users. This is by design — it is a *test client*, not a production inference endpoint.

## Stack

- [Next.js 16](https://nextjs.org/) (App Router) + TypeScript + Tailwind CSS v4
- [`@gradio/client`](https://www.npmjs.com/package/@gradio/client) for talking to the model's Space
- [`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist) for client-side PDF rasterization
- Deployed on [Vercel](https://vercel.com/)

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

No API keys or environment variables are required — the Space it talks to is public.

## Credits & license

- Model, weights, and inference code: [baidu/Unlimited-OCR](https://github.com/baidu/Unlimited-OCR) (MIT).
- This interface is an independent community project and is **not affiliated with or endorsed by Baidu**.
- Citrus Global branding (logo, colors, name) is proprietary to Citrus Global; the application code in this repository is otherwise available under the MIT License (see [LICENSE](./LICENSE)).
