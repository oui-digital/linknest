/**
 * Warn before a link description is cut off on the page.
 *
 * The public card clamps descriptions to two lines (`line-clamp-2`), both on
 * full-width cards and on the half-width tiles of the grid templates, and the
 * editor said nothing: an owner could write 200 characters and ship a card
 * ending in "…". These are soft, approximate limits — a half-width tile is
 * about 160 px wide on a 375 px phone at the small text size, roughly 18-20
 * characters a line; a full card with a thumbnail has about 230 px for text.
 * Tune the constants against real pages rather than deriving them.
 */

export const DESCRIPTION_MAX = 200;
export const TILE_SOFT_LIMIT = 50;
export const CARD_SOFT_LIMIT = 100;
/** The clamp shows this many lines. */
export const DESCRIPTION_LINES = 2;

export type DescriptionHint = {
  count: number;
  max: number;
  /** Likely to be clamped on the page. */
  warn: boolean;
};

export function descriptionHint(
  text: string,
  { tile }: { tile: boolean },
): DescriptionHint {
  const count = text.length;
  const lines = text === "" ? 0 : text.split("\n").length;
  const softLimit = tile ? TILE_SOFT_LIMIT : CARD_SOFT_LIMIT;
  return {
    count,
    max: DESCRIPTION_MAX,
    warn: count > softLimit || lines > DESCRIPTION_LINES,
  };
}
