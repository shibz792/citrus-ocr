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

// Best-effort split of a table-ish block's content into rows/cells. Models in
// this family often (not always) emit tables as markdown-style pipe rows.
export function parseTableRows(content: string): string[][] | null {
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
