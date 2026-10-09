/**
 * Every destination a block can put in front of a visitor.
 *
 * The `url` column is one of them; block types that carry links inside
 * `content` (social icons, embeds) add theirs here. Publishing and live edits
 * scan this list, never the column alone — a destination that only lives in
 * `content` must pass the same Safe Browsing check as a plain link.
 *
 * Owner-uploaded images are not destinations: they are first-party assets
 * (src/lib/assets.ts) and are never scanned.
 */
import { parseBlockContent } from "@/lib/blocks/content";

export type ScannableBlock = {
  type: string;
  url: string | null;
  content: unknown;
};

export function extractScannableUrls(block: ScannableBlock): string[] {
  const urls: string[] = [];
  if (block.url) urls.push(block.url);
  if (block.type === "socials") {
    for (const item of parseBlockContent("socials", block.content).items ?? []) {
      urls.push(item.url);
    }
  }
  return [...new Set(urls)];
}
