"use client";

import { categoryLabel, parseTableRows, type LayoutBlock } from "@/lib/parseLayout";

export function StructuredBlocks({ blocks }: { blocks: LayoutBlock[] }) {
  if (blocks.length === 0) {
    return (
      <p className="p-4 text-sm text-foreground-muted">
        Structure will appear here once the model has detected some layout.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4 p-4">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-full bg-citrus-pink-soft px-2 py-0.5 text-[10px] font-semibold tracking-wide text-citrus-pink uppercase">
      {label}
    </span>
  );
}

function BlockView({ block }: { block: LayoutBlock }) {
  const label = categoryLabel(block.category);

  if (block.category === "title") {
    return (
      <div>
        <Tag label={label} />
        <h3 className="mt-1.5 text-lg font-bold leading-snug">{block.content}</h3>
      </div>
    );
  }

  if (block.category === "table") {
    const rows = parseTableRows(block.content);
    if (rows && rows.length > 0) {
      return (
        <div>
          <Tag label={label} />
          <div className="mt-1.5 overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className={ri === 0 ? "bg-surface-muted font-semibold" : ""}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="border border-border px-2.5 py-1.5 align-top">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
  }

  if (block.category === "formula") {
    return (
      <div>
        <Tag label={label} />
        <p className="mt-1.5 rounded-lg bg-surface-muted px-3 py-2 font-mono text-sm italic">
          {block.content}
        </p>
      </div>
    );
  }

  if (block.category === "figure" || block.category === "image") {
    return (
      <div>
        <Tag label={label} />
        <p className="mt-1.5 text-sm italic text-foreground-muted">
          Figure region detected — see the Layout tab for its position.
        </p>
      </div>
    );
  }

  return (
    <div>
      <Tag label={label} />
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{block.content}</p>
    </div>
  );
}
