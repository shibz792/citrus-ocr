import { Client } from "@gradio/client";

export const runtime = "nodejs";
// ZeroGPU spaces can queue behind other users and take a while to cold-start.
// Hobby-plan default max on Vercel (with Fluid compute) is 300s; stay under it.
export const maxDuration = 280;

const SPACE_ID = "baidu/Unlimited-OCR";
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB

type OcrPayload = { text?: string; done?: boolean };

function ndjson(obj: unknown) {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response(JSON.stringify({ error: "Expected multipart/form-data." }), {
      status: 400,
    });
  }

  const file = form.get("file");
  const mode = (form.get("mode") as string | null) ?? "gundam";
  const prompt = (form.get("prompt") as string | null) ?? "document parsing.";

  if (!(file instanceof Blob) || file.size === 0) {
    return new Response(JSON.stringify({ error: "No image page was uploaded." }), {
      status: 400,
    });
  }
  if (file.size > MAX_FILE_BYTES) {
    return new Response(
      JSON.stringify({ error: "That page is larger than 20MB — please use a smaller image." }),
      { status: 413 },
    );
  }
  if (mode !== "gundam" && mode !== "base") {
    return new Response(JSON.stringify({ error: "mode must be 'gundam' or 'base'." }), {
      status: 400,
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (!closed) controller.enqueue(ndjson(obj));
      };

      try {
        send({ type: "status", message: "Connecting…" });

        // An anonymous connection shares ZeroGPU quota with every other
        // anonymous caller of this Space — including, in practice, everyone
        // else hitting it from Vercel's shared egress IPs. Authenticating
        // with a (free) Hugging Face token gives this app its own quota
        // instead. Falls back to anonymous if HF_TOKEN isn't set.
        const hfToken = process.env.HF_TOKEN as `hf_${string}` | undefined;
        const client = await Client.connect(SPACE_ID, hfToken ? { token: hfToken } : undefined);
        const job = client.submit("/run_ocr", {
          image_path: file,
          mode,
          prompt,
        });

        let sawError = false;
        let receivedText = false;

        for await (const msg of job) {
          if (msg.type === "status") {
            if (msg.stage === "error") {
              sawError = true;
              send({
                type: "error",
                message:
                  (typeof msg.message === "string" && msg.message) ||
                  "Something went wrong while processing this page.",
              });
              continue;
            }
            if (msg.stage === "pending" && typeof msg.position === "number" && msg.position > 0) {
              send({
                type: "status",
                message: `Queued behind ${msg.position} other request${msg.position === 1 ? "" : "s"} on the shared GPU…`,
              });
            } else if (msg.stage === "generating" || msg.stage === "streaming") {
              send({ type: "status", message: "Running inference…" });
            }
          } else if (msg.type === "data") {
            const payload = Array.isArray(msg.data) ? (msg.data[0] as OcrPayload) : undefined;
            if (payload) {
              if (payload.text) receivedText = true;
              send({ type: "token", text: payload.text ?? "", done: !!payload.done });
            }
          }
        }

        // A shared, free GPU can drop a job without ever surfacing an error
        // (silently timed out in queue, evicted mid-run, etc). Never let that
        // look like a successful, empty result — surface it as a failure so
        // the page can be retried instead.
        if (!sawError && !receivedText) {
          send({
            type: "error",
            message:
              "The model didn't return any text — the shared GPU may be overloaded right now. Try again in a moment.",
          });
        } else if (!sawError) {
          send({ type: "complete" });
        }
      } catch (err) {
        send({
          type: "error",
          message:
            err instanceof Error
              ? err.message
              : "Something went wrong processing this page.",
        });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
