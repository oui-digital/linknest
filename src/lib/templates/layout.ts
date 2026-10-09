import type { LayoutType } from "@/lib/templates";
import { parseBlockContent } from "@/lib/blocks/content";

/**
 * Grid placement for the two grid templates (card-grid, bento-grid).
 *
 * Both are two columns at every width: the content column is 480px, so a cell
 * is ~220px on desktop and ~160px on a phone. Blocks that read as rows (text,
 * headings, icon rows, forms, media) always take the full width; links and
 * images are tiles unless their size says otherwise. There is no dense
 * packing: visual order always equals block order, so the keyboard and screen
 * readers follow what the eye sees.
 */

export const GRID_LAYOUTS: readonly LayoutType[] = ["card-grid", "bento-grid"];

export const FULL_WIDTH_TYPES: ReadonlySet<string> = new Set([
  "header",
  "text",
  "divider",
  "socials",
  "embed",
  "email_capture",
]);

export const BLOCK_SIZES = ["default", "wide", "tall"] as const;
export type BlockSize = (typeof BLOCK_SIZES)[number];

export function isGridLayout(layout: LayoutType): boolean {
  return GRID_LAYOUTS.includes(layout);
}

/** The sizes the editor offers for a block in a layout (empty = no control). */
export function sizeOptions(type: string, layout: LayoutType): BlockSize[] {
  if (!isGridLayout(layout) || (type !== "link" && type !== "image")) return [];
  return layout === "bento-grid" ? ["default", "wide", "tall"] : ["default", "wide"];
}

export type GridPlacement = { className: string; tile: boolean };

export function gridPlacement(
  block: { type: string; content: unknown },
  layout: LayoutType,
): GridPlacement {
  if (FULL_WIDTH_TYPES.has(block.type)) return { className: "col-span-2", tile: false };

  const content = parseBlockContent(block.type, block.content);
  if (block.type === "link" && content.featured === true) {
    return { className: "col-span-2", tile: false };
  }

  const size = content.size as BlockSize | undefined;
  if (size === "wide") return { className: "col-span-2", tile: false };
  if (size === "tall" && layout === "bento-grid") return { className: "row-span-2", tile: true };
  return { className: "", tile: true };
}
