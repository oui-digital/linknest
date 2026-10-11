import { GOOGLE_FONTS } from "./theme";

/**
 * Build the Google Fonts stylesheet URL for the families a page actually uses.
 *
 * The theme editor let Pro users pick from 30 Google fonts and wrote the family
 * into the CSS font stack, but nothing ever loaded the font file — so every
 * choice silently fell back to the generic family on the visitor's device. Only
 * the one or two families a page uses are requested, which keeps the public
 * page's font cost flat regardless of how many fonts the picker offers.
 *
 * Returns null when the page uses only system fonts (no request needed).
 */
export function getGoogleFontsUrl(
  fontValues: (string | undefined)[],
): string | null {
  const families = new Map<string, readonly string[]>();

  for (const value of fontValues) {
    if (!value) continue;
    const match = GOOGLE_FONTS.find((font) => font.value === value);
    if (match) families.set(match.name, match.weights);
  }

  if (families.size === 0) return null;

  const params = [...families]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([name, weights]) =>
        `family=${encodeURIComponent(name).replace(/%20/g, "+")}:wght@${weights.join(";")}`,
    )
    .join("&");

  // display=swap so text paints immediately in the fallback rather than
  // blocking the largest contentful paint on a third-party request.
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
