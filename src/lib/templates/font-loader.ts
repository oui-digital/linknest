import { GOOGLE_FONTS } from "./theme";
import { getGoogleFontsUrl } from "./fonts";
import type { LoadedFont, ResolvedFonts } from "./font-types";

/**
 * Self-hosted template fonts for the public page (server side).
 *
 * Pro pages could pick from 30 Google families, loaded through a
 * render-blocking, cross-origin stylesheet from fonts.googleapis.com. The
 * families are now served from this deployment through next/font: one module
 * per family under ./google-fonts, imported on demand through the static
 * switch below, so a page only carries the CSS of the families it uses.
 *
 * The editor's phone frame is a client component and keeps the stylesheet
 * path (`getGoogleFontsUrl`); `remoteUrl` also covers any family that is not
 * self-hosted yet.
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

// A static switch, not a template-string import: next/font must see every
// module as a literal import to self-host it at build time.
async function importFont(id: string): Promise<FontModule | null> {
  switch (id) {
    case "archivo":
      return await import("./google-fonts/archivo");
    case "barlow":
      return await import("./google-fonts/barlow");
    case "bitter":
      return await import("./google-fonts/bitter");
    case "cabin":
      return await import("./google-fonts/cabin");
    case "crimson-text":
      return await import("./google-fonts/crimson-text");
    case "dm-sans":
      return await import("./google-fonts/dm-sans");
    case "dm-serif":
      return await import("./google-fonts/dm-serif");
    case "fira-sans":
      return await import("./google-fonts/fira-sans");
    case "inconsolata":
      return await import("./google-fonts/inconsolata");
    case "jetbrains-mono":
      return await import("./google-fonts/jetbrains-mono");
    case "josefin":
      return await import("./google-fonts/josefin");
    case "karla":
      return await import("./google-fonts/karla");
    case "lato":
      return await import("./google-fonts/lato");
    case "libre-baskerville":
      return await import("./google-fonts/libre-baskerville");
    case "lora":
      return await import("./google-fonts/lora");
    case "merriweather":
      return await import("./google-fonts/merriweather");
    case "montserrat":
      return await import("./google-fonts/montserrat");
    case "nunito":
      return await import("./google-fonts/nunito");
    case "open-sans":
      return await import("./google-fonts/open-sans");
    case "overpass":
      return await import("./google-fonts/overpass");
    case "playfair":
      return await import("./google-fonts/playfair");
    case "poppins":
      return await import("./google-fonts/poppins");
    case "quicksand":
      return await import("./google-fonts/quicksand");
    case "raleway":
      return await import("./google-fonts/raleway");
    case "roboto":
      return await import("./google-fonts/roboto");
    case "rubik":
      return await import("./google-fonts/rubik");
    case "sora":
      return await import("./google-fonts/sora");
    case "source-serif":
      return await import("./google-fonts/source-serif");
    case "space-grotesk":
      return await import("./google-fonts/space-grotesk");
    case "work-sans":
      return await import("./google-fonts/work-sans");
    default:
      return null;
  }
}
