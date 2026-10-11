import { GOOGLE_FONTS } from "./theme";
import { getGoogleFontsUrl } from "./fonts";
import type { LoadedFont, ResolvedFonts } from "./font-types";

/**
 * Self-hosted template fonts for the public page (server side).
 *
 * Pro pages could pick from 30 Google families, loaded through a
 * render-blocking, cross-origin stylesheet from fonts.googleapis.com. The
 * families in SELF_HOSTED_FONT_IDS are served from this deployment through
 * next/font (one module each under ./google-fonts); the rest still come from
 * Google through `remoteUrl`, as does everything in the editor's client
 * preview (`getGoogleFontsUrl`).
 */

export type { LoadedFont, ResolvedFonts } from "./font-types";
export { genericFamily } from "./font-types";

type FontModule = { font: { className: string; style: { fontFamily: string } } };

export async function loadTemplateFont(id: string): Promise<LoadedFont | null> {
  const mod = await importFont(id);
  if (!mod) return null;
  return { fontFamily: mod.font.style.fontFamily, className: mod.font.className };
}

/** The theme's two font values resolved to self-hosted fonts where possible. */
export async function resolveThemeFonts(theme: {
  fontHeading?: string;
  fontBody?: string;
}): Promise<ResolvedFonts> {
  const headingId = googleFontId(theme.fontHeading);
  const bodyId = googleFontId(theme.fontBody);
  const [heading, body] = await Promise.all([
    headingId ? loadTemplateFont(headingId) : null,
    bodyId ? loadTemplateFont(bodyId) : null,
  ]);
  const remote = [
    headingId && !heading ? theme.fontHeading : undefined,
    bodyId && !body ? theme.fontBody : undefined,
  ];
  return { heading, body, remoteUrl: getGoogleFontsUrl(remote) };
}

export function googleFontId(value: string | undefined): string | null {
  if (!value) return null;
  return GOOGLE_FONTS.find((font) => font.value === value)?.id ?? null;
}

/**
 * Families served from this deployment. Only these have a module under
 * ./google-fonts; every other GOOGLE_FONTS family stays on the Google
 * stylesheet.
 *
 * Deliberately short. Next collects the CSS of every font module reachable
 * from the route, dynamic imports included: with all 30 families hosted, a
 * public page using Sora (or system fonts) rendered 31 stylesheet links. One
 * hosted family costs every public page one small extra stylesheet; add a
 * family only when published pages use it, and re-check the rendered <link>
 * elements and network requests of a system-font page afterwards.
 */
export const SELF_HOSTED_FONT_IDS = ["sora"] as const;

// A static switch, not a template-string import: next/font must see every
// module as a literal import to self-host it at build time.
async function importFont(id: string): Promise<FontModule | null> {
  switch (id) {
    case "sora":
      return await import("./google-fonts/sora");
    default:
      return null;
  }
}
