import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getGoogleFontsUrl } from "./fonts";
import { GOOGLE_FONTS } from "./theme";
import { SELF_HOSTED_FONT_IDS } from "./font-loader";

describe("getGoogleFontsUrl", () => {
  it("returns null when only system fonts are used", () => {
    expect(getGoogleFontsUrl(["Georgia, serif", undefined])).toBeNull();
  });

  it("requests the family's own weights, not a fixed 400;500;700", () => {
    const sora = getGoogleFontsUrl(["'Sora', sans-serif"]);
    expect(sora).toContain("family=Sora:wght@400;500;700");

    // These families do not ship a 500; a request for it failed quietly.
    expect(getGoogleFontsUrl(["'DM Serif Display', serif"])).toContain(
      "family=DM+Serif+Display:wght@400&",
    );
    expect(getGoogleFontsUrl(["'Crimson Text', serif"])).toContain(
      "family=Crimson+Text:wght@400;600;700",
    );
    expect(getGoogleFontsUrl(["'Lato', sans-serif"])).toContain("family=Lato:wght@400;700;900");
  });

  it("lists each family once, sorted, with display=swap", () => {
    const url = getGoogleFontsUrl(["'Sora', sans-serif", "'Lato', sans-serif", "'Sora', sans-serif"]);
    expect(url).toBe(
      "https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Sora:wght@400;500;700&display=swap",
    );
  });
});

describe("self-hosted font modules", () => {
  const dir = join(process.cwd(), "src/lib/templates/google-fonts");

  it("exist for exactly the self-hosted families and repeat the shared weights literally", () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.sort()).toEqual([...SELF_HOSTED_FONT_IDS].map((id) => `${id}.ts`).sort());
    for (const id of SELF_HOSTED_FONT_IDS) {
      const font = GOOGLE_FONTS.find((f) => f.id === id)!;
      const source = readFileSync(join(dir, `${id}.ts`), "utf8");
      const literal = JSON.stringify(font.weights).replace(/,/g, ", ");
      expect(source, id).toContain(`weight: ${literal},`);
      expect(source, id).toContain(`export const WEIGHTS = ${literal} as const;`);
      expect(source, id).toContain(`import { ${font.name.replace(/ /g, "_")} } from "next/font/google";`);
    }
  });
});
