// Renders a PDF's pages to PNG blobs entirely in the browser (via pdf.js), so
// each page can be sent to the OCR endpoint exactly like a plain image upload.
// This sidesteps the upstream Space's own `/explode_pdf` endpoint, whose output
// paths only resolve reliably inside that Space's own process.

const TARGET_WIDTH = 1600;
const MAX_PAGES = 30;

export async function pdfToImageBlobs(file: File): Promise<Blob[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  const blobs: Blob[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.max(TARGET_WIDTH / baseViewport.width, 1);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({ canvas, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (blob) blobs.push(blob);
    page.cleanup();
  }

  await loadingTask.destroy();
  return blobs;
}
