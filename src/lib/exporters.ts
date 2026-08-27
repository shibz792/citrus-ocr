import { parseLayoutBlocks, parseTableRows, categoryLabel, type LayoutBlock } from "./parseLayout";

export type ExportPage = {
  sourceLabel: string;
  text: string;
  rawText: string;
};

export type ExportFormat = "txt" | "md" | "docx" | "pdf" | "json";

export type BuiltExport = { content: string | Blob; mime: string; ext: string };

function blocksForPage(page: ExportPage): LayoutBlock[] {
  const blocks = parseLayoutBlocks(page.rawText).filter((b) => b.content);
  if (blocks.length > 0) return blocks;
  return page.text ? [{ category: "text", bbox: null, content: page.text }] : [];
}

const multiSource = (pages: ExportPage[]) =>
  new Set(pages.map((p) => p.sourceLabel)).size > 1;

function pageHeading(pages: ExportPage[], page: ExportPage, index: number): string | null {
  if (pages.length <= 1) return null;
  return multiSource(pages) ? page.sourceLabel : `Page ${index + 1}`;
}

// ── Plain text ────────────────────────────────────────────────────────────
export function buildTxt(pages: ExportPage[]): string {
  return pages
    .map((p, i) => {
      const heading = pageHeading(pages, p, i);
      return heading ? `--- ${heading} ---\n${p.text}` : p.text;
    })
    .join("\n\n")
    .trim();
}

// ── Markdown, structure-aware ────────────────────────────────────────────
export function buildMarkdown(pages: ExportPage[]): string {
  const sections = pages.map((page, i) => {
    const heading = pageHeading(pages, page, i);
    const blocks = blocksForPage(page);
    const body = blocks
      .map((block) => {
        if (block.category === "title") return `## ${block.content}`;
        if (block.category === "table") {
          const rows = parseTableRows(block.content);
          if (rows && rows.length > 0) {
            const [header, ...rest] = rows;
            const sep = header.map(() => "---");
            return [header, sep, ...rest].map((r) => `| ${r.join(" | ")} |`).join("\n");
          }
          return "```\n" + block.content + "\n```";
        }
        if (block.category === "formula") return `*${block.content}*`;
        return block.content;
      })
      .join("\n\n");
    return heading ? `### ${heading}\n\n${body}` : body;
  });
  return sections.join("\n\n---\n\n").trim();
}

// ── JSON, fully structured (category + bbox per block) ───────────────────
export function buildJson(pages: ExportPage[]): string {
  return JSON.stringify(
    {
      pages: pages.map((page, i) => ({
        page: i + 1,
        source: page.sourceLabel,
        text: page.text,
        blocks: blocksForPage(page).map((b) => ({
          category: categoryLabel(b.category),
          bbox: b.bbox,
          content: b.content,
        })),
      })),
    },
    null,
    2,
  );
}

// ── Word (.docx) — real headings, tables and paragraphs ──────────────────
export async function buildDocx(pages: ExportPage[]): Promise<Blob> {
  const {
    Document,
    Packer,
    Paragraph,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
    TextRun,
    WidthType,
  } = await import("docx");

  const children: InstanceType<typeof Paragraph | typeof Table>[] = [];

  pages.forEach((page, i) => {
    const heading = pageHeading(pages, page, i);
    if (heading) {
      children.push(
        new Paragraph({ heading: HeadingLevel.HEADING_1, text: heading, spacing: { before: 300 } }),
      );
    }

    for (const block of blocksForPage(page)) {
      if (block.category === "title") {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, text: block.content }));
        continue;
      }

      if (block.category === "table") {
        const rows = parseTableRows(block.content);
        if (rows && rows.length > 0) {
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: rows.map(
                (row, rowIndex) =>
                  new TableRow({
                    children: row.map(
                      (cell) =>
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [new TextRun({ text: cell, bold: rowIndex === 0 })],
                            }),
                          ],
                        }),
                    ),
                  }),
              ),
            }),
          );
          children.push(new Paragraph({ text: "" }));
          continue;
        }
      }

      const italics = block.category === "formula";
      for (const line of block.content.split("\n")) {
        children.push(new Paragraph({ children: [new TextRun({ text: line, italics })] }));
      }
    }
  });

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}

// ── PDF — headings, wrapped paragraphs, and simple grid tables ───────────
export async function buildPdf(pages: ExportPage[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const writeParagraph = (text: string, { size = 11, bold = false, italic = false } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : italic ? "italic" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    for (const line of lines) {
      ensureSpace(size * 1.4);
      doc.text(line, margin, y);
      y += size * 1.4;
    }
    y += size * 0.5;
  };

  const writeTable = (rows: string[][]) => {
    const colWidth = maxWidth / Math.max(rows[0]?.length ?? 1, 1);
    const rowHeight = 22;
    doc.setFontSize(9);
    rows.forEach((row, rowIndex) => {
      ensureSpace(rowHeight);
      row.forEach((cell, colIndex) => {
        const x = margin + colIndex * colWidth;
        doc.setDrawColor(200);
        doc.rect(x, y, colWidth, rowHeight);
        doc.setFont("helvetica", rowIndex === 0 ? "bold" : "normal");
        const cellLines = doc.splitTextToSize(cell, colWidth - 8) as string[];
        doc.text(cellLines.slice(0, 2), x + 4, y + 14);
      });
      y += rowHeight;
    });
    y += 12;
  };

  pages.forEach((page, i) => {
    const heading = pageHeading(pages, page, i);
    if (heading) {
      ensureSpace(40);
      writeParagraph(heading, { size: 16, bold: true });
    }

    for (const block of blocksForPage(page)) {
      if (block.category === "title") {
        writeParagraph(block.content, { size: 14, bold: true });
        continue;
      }
      if (block.category === "table") {
        const rows = parseTableRows(block.content);
        if (rows && rows.length > 0) {
          writeTable(rows);
          continue;
        }
      }
      writeParagraph(block.content, { italic: block.category === "formula" });
    }
  });

  return doc.output("blob");
}

export async function buildExport(format: ExportFormat, pages: ExportPage[]): Promise<BuiltExport> {
  switch (format) {
    case "json":
      return { content: buildJson(pages), mime: "application/json;charset=utf-8", ext: "json" };
    case "md":
      return { content: buildMarkdown(pages), mime: "text/markdown;charset=utf-8", ext: "md" };
    case "docx":
      return {
        content: await buildDocx(pages),
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ext: "docx",
      };
    case "pdf":
      return { content: await buildPdf(pages), mime: "application/pdf", ext: "pdf" };
    case "txt":
    default:
      return { content: buildTxt(pages), mime: "text/plain;charset=utf-8", ext: "txt" };
  }
}
