/**
 * Types shared by the server-side font loader and the page frame. Kept apart
 * from font-loader.ts so the frame (also rendered by the editor's client
 * preview) never pulls the loader's 30 dynamic font imports into a client
 * bundle.
 */

export type LoadedFont = {
  /** The next/font family stack, e.g. "'__Sora_abc', '__Sora_Fallback_abc'". */
  fontFamily: string;
  className: string;
};

export type ResolvedFonts = {
  heading: LoadedFont | null;
  body: LoadedFont | null;
  /** Google stylesheet for families that are not self-hosted; null if none. */
  remoteUrl: string | null;
};

/** `'Sora', sans-serif` → "sans-serif": the generic to keep after the family. */
export function genericFamily(value: string | undefined): string {
  const generic = value?.split(",").slice(1).join(",").trim();
  return generic || "sans-serif";
}
