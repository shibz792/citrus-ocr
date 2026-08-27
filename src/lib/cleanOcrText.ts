import { flattenHtmlTables } from "./parseLayout";

// The model streams raw detection markup and debug banners inline with the
// text before its final cleaned pass, and even that final pass leaves inline
// HTML tables as literal tags. Strip/flatten all of that for display.
export function cleanOcrText(raw: string): string {
  const withoutMarkup = raw
    .replace(/<\|det\|>[\s\S]*?<\|\/det\|>/g, "")
    .replace(/<\|\/?det\|>/g, "")
    .replace(/={5,}\s*save results:?\s*={5,}/gi, "");

  return flattenHtmlTables(withoutMarkup)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
