"use client";

import { categoryColor, categoryLabel, type LayoutBlock } from "@/lib/parseLayout";

// Renders the page image with the model's own detected regions drawn on top —
// the same <|det|> category + bounding-box output it streams, made visible.
export function LayoutOverlay({
  imageUrl,
  blocks,
}: {
  imageUrl: string;
  blocks: LayoutBlock[];
}) {
  const boxed = blocks.filter((b) => b.bbox);

  return (
    <div className="p-4">
      <div className="relative mx-auto max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="Page preview with detected layout" className="block w-full rounded-lg" />
        <div className="pointer-events-none absolute inset-0">
          {boxed.map((block, i) => {
            const [x1, y1, x2, y2] = block.bbox!;
            const color = categoryColor(block.category);
            return (
              <div
                key={i}
                className="pointer-events-auto group absolute rounded-[2px] border-2 transition-colors hover:bg-white/10"
                style={{
                  left: `${x1 / 10}%`,
                  top: `${y1 / 10}%`,
                  width: `${Math.max(x2 - x1, 2) / 10}%`,
                  height: `${Math.max(y2 - y1, 2) / 10}%`,
                  borderColor: color,
                }}
              >
                <span
                  className="pointer-events-none absolute -top-5 left-0 z-10 hidden max-w-[16rem] truncate rounded px-1.5 py-0.5 text-[10px] font-semibold text-white group-hover:block"
                  style={{ backgroundColor: color }}
                >
                  {categoryLabel(block.category)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {boxed.length === 0 && (
        <p className="mt-3 text-center text-sm text-foreground-muted">
          No layout regions detected yet.
        </p>
      )}
    </div>
  );
}
