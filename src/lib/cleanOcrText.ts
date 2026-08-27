// The model streams raw detection markup and debug banners inline with the
// text before its final cleaned pass. Strip that out for display.
export function cleanOcrText(raw: string): string {
  return raw
    .replace(/<\|det\|>[\s\S]*?<\|\/det\|>/g, "")
    .replace(/<\|\/?det\|>/g, "")
    .replace(/={5,}\s*save results:?\s*={5,}/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
