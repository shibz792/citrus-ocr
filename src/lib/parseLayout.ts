// Unlimited-OCR streams its output as a sequence of
//   <|det|>category [x1,y1,x2,y2]<|/det|>content
// blocks, where the box is normalized to a 0–1000 grid. This turns that raw
// stream into a structured list of blocks — which is what powers the
// structured view, the layout-box overlay, and the Word/PDF export, instead
// of just dumping flat text everywhere.

export type LayoutBlock = {
  category: string;
  bbox: [number, number, number, number] | null;
  content: string;
};

const MARKER_RE = /<\|det\|>([^<\s]+)(?:\s*\[([^\]]*)\])?\s*<\|\/det\|>/g;

export function parseLayoutBlocks(raw: string): LayoutBlock[] {
  const markers: { category: string; bbox: LayoutBlock["bbox"]; start: number; end: number }[] =
    [];
  MARKER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKER_RE.exec(raw))) {
    const category = match[1].toLowerCase();
    let bbox: LayoutBlock["bbox"] = null;
    if (match[2]) {
      const nums = match[2].split(",").map((n) => parseFloat(n.trim()));
      if (nums.length === 4 && nums.every(Number.isFinite)) {
        bbox = [nums[0], nums[1], nums[2], nums[3]];
      }
    }
    markers.push({ category, bbox, start: match.index, end: MARKER_RE.lastIndex });
  }

  return markers
    .map((m, i) => {
      const end = i + 1 < markers.length ? markers[i + 1].start : raw.length;
      const content = raw
        .slice(m.end, end)
        .replace(/={5,}\s*save results:?\s*={5,}/gi, "")
        .trim();
      return { category: m.category, bbox: m.bbox, content };
    })
    .filter((b) => b.category !== "image" || b.bbox);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'");
}

// Flattens one <td>/<th>'s inner HTML down to plain text. Any line break —
// a <br>, or a literal newline the model left inside the cell — becomes a
// space rather than nothing, since two lines glued together with zero
// separator ("JUAN" + "YELLOW" → "JUANYELLOW") is worse than one glued with
// an extra space would be.
function cellText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s*\n\s*/g, " ")
      .replace(/[ \t]+/g, " "),
  ).trim();
}

// Unlimited-OCR emits tables as literal HTML (`<table><tr><td>…`), not
// Markdown. Parse that properly instead of dumping the raw tags as text.
function parseHtmlTableRows(content: string): string[][] | null {
  const tableMatch = content.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) return null;

  const rowMatches = [...tableMatch[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rowMatches.length === 0) return null;

  const rows = rowMatches.map((row) =>
    [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cellText(cell[1])),
  );

  // Source tables often flatten colspans into extra blank <td>s, anywhere in
  // the row (not just trailing) — drop any column that's empty across every
  // row entirely.
  const width = Math.max(...rows.map((r) => r.length), 0);
  if (width === 0) return null;
  const keep: number[] = [];
  for (let col = 0; col < width; col++) {
    if (rows.some((r) => (r[col] ?? "").trim())) keep.push(col);
  }
  if (keep.length === 0) return null;

  return rows.map((r) => keep.map((col) => r[col] ?? ""));
}

// Best-effort split of a table-ish block's content into rows/cells. Tries
// literal HTML tables first (what this model actually emits), then falls
// back to Markdown-style pipe rows some models in this family use.
function parseMarkdownTableRows(content: string): string[][] | null {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^\|?[\s:|-]+\|?$/.test(l)); // drop markdown separator rows
  if (lines.length < 1 || !lines.every((l) => l.includes("|"))) return null;
  return lines.map((l) =>
    l
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim()),
  );
}

export function parseTableRows(content: string): string[][] | null {
  return parseHtmlTableRows(content) ?? parseMarkdownTableRows(content);
}

// The model's "cleaned" final text still leaves inline HTML tables verbatim
// (`<table><tr><td>…`) — only the <|det|> category markers get stripped.
// Swap any such table for a plain-text rendition so the Text view never
// shows raw tags.
export function flattenHtmlTables(text: string): string {
  return text.replace(/<table[\s\S]*?<\/table>/gi, (match) => {
    const rows = parseHtmlTableRows(match);
    if (!rows || rows.length === 0) return "";
    return rows.map((row) => row.join("  |  ")).join("\n");
  });
}

export const CATEGORY_LABELS: Record<string, string> = {
  title: "Title",
  text: "Text",
  paragraph: "Text",
  table: "Table",
  formula: "Formula",
  figure: "Figure",
  image: "Figure",
  header: "Header",
  footer: "Footer",
  caption: "Caption",
  list: "List",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/\b\w/g, (c) => c.toUpperCase());
}

export const CATEGORY_COLORS: Record<string, string> = {
  title: "#EF4770",
  table: "#06D59C",
  formula: "#8B5CF6",
  figure: "#57595B",
  image: "#57595B",
  header: "#B7B3AE",
  footer: "#B7B3AE",
};

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? "#EF4770";
}
