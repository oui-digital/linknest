import type { InferSelectModel } from "drizzle-orm";
import type { blocks as blocksSchema } from "@/lib/db/schema";
import { parseBlockContent } from "@/lib/blocks/content";
import type { BlockStyleOverrides } from "@/lib/templates/theme";

type Block = InferSelectModel<typeof blocksSchema>;

/**
 * Apply an edit to the latest block list.
 *
 * `contentPatch` changes only the given content keys (undefined removes a
 * key) on top of the block's CURRENT content. Asynchronous callbacks (an
 * upload finishing) must use it: building a whole `content` object from the
 * state captured when the upload started would overwrite everything edited
 * meanwhile. `updates.content`, by contrast, replaces content wholesale and
 * is only safe from a synchronous handler that read the current render.
 *
 * `stylePatch` does the same one level down, for `content.styleOverrides`.
 *
 * Returns the new list and the full content to save (content is always sent
 * whole because the server replaces it).
 */
export function applyBlockEdit(
  blocks: Block[],
  blockId: string,
  updates: Partial<Block>,
  contentPatch?: Record<string, unknown>,
  stylePatch?: Partial<BlockStyleOverrides>,
): { blocks: Block[]; content?: Record<string, unknown> } {
  const current = blocks.find((b) => b.id === blockId);
  if (!current) return { blocks };

  let content = updates.content as Record<string, unknown> | undefined;
  if (stylePatch) {
    // Merged key by key into the CURRENT overrides: two colour changes in
    // quick succession each keep the other (the colour inputs save after a
    // pause, from a callback created before the other change landed).
    const base = content ?? parseBlockContent(current.type, current.content);
    const style: Record<string, unknown> = {
      ...((base.styleOverrides as Record<string, unknown> | undefined) ?? {}),
      ...stylePatch,
    };
    for (const key of Object.keys(style)) {
      if (style[key] === undefined) delete style[key];
    }
    contentPatch = { ...contentPatch, styleOverrides: Object.keys(style).length > 0 ? style : undefined };
  }
  if (contentPatch) {
    const merged: Record<string, unknown> = {
      ...(content ?? parseBlockContent(current.type, current.content)),
      ...contentPatch,
    };
    for (const key of Object.keys(merged)) {
      if (merged[key] === undefined) delete merged[key];
    }
    content = merged;
  }

  const next = { ...current, ...updates, ...(content ? { content } : {}) };
  return { blocks: blocks.map((b) => (b.id === blockId ? next : b)), content };
}

/** Put a block back at its position (a refused delete). */
export function restoreBlock(blocks: Block[], block: Block): Block[] {
  if (blocks.some((b) => b.id === block.id)) return blocks;
  return [...blocks, block].sort((a, b) => a.position - b.position);
}
