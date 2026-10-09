import { describe, it, expect } from "vitest";
import {
  contrastRatio,
  parseColor,
  gradientStops,
  WCAG_AA_NORMAL,
} from "./contrast";
import { TEMPLATES } from "./templates";
import { COLOR_PALETTES, featuredLinkStyle } from "./templates/theme";
import type { ThemeTokens } from "./templates/theme";

describe("parseColor", () => {
  it("handles hex, short hex and rgba", () => {
    expect(parseColor("#FFFFFF")).toEqual([255, 255, 255]);
    expect(parseColor("#fff")).toEqual([255, 255, 255]);
    // The Glass template stores colorSurface as rgba(...) — a hex-only parser
    // silently produced NaN on real product data.
    expect(parseColor("rgba(255, 255, 255, 0.08)")).toEqual([255, 255, 255]);
    expect(parseColor("not-a-color")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    // Canonical mid-grey reference point
    expect(contrastRatio("#767676", "#FFFFFF")!).toBeGreaterThanOrEqual(4.5);
  });
});

/** Every background colour a visitor could actually see for a theme. */
function visibleBackgrounds(theme: ThemeTokens): string[] {
  if (theme.backgroundEffect === "gradient" && theme.backgroundGradient) {
    const stops = gradientStops(theme.backgroundGradient);
    if (stops.length > 0) return stops;
  }
  return [theme.colorBackground];
}

/**
 * Guards the product's own "All text meets 4.5:1" commitment.
 *
 * Four shipped presets failed this on the day they were written — including two
 * on the free tier, reachable with no customization at all. Text is measured
 * against the WORST stop of whatever actually paints the background, because a
 * gradient covers colorBackground entirely.
 */
describe("shipped templates meet WCAG AA for body text", () => {
  for (const template of TEMPLATES) {
    const theme = template.defaultTheme as ThemeTokens;
    const backgrounds = visibleBackgrounds(theme);

    for (const field of ["colorText", "colorTextMuted"] as const) {
      it(`${template.id}: ${field}`, () => {
        for (const bg of backgrounds) {
          const ratio = contrastRatio(theme[field], bg);
          expect(ratio, `${theme[field]} on ${bg}`).not.toBeNull();
          expect(
            ratio!,
            `${template.id} ${field} ${theme[field]} on ${bg} = ${ratio!.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
        }
      });
    }
  }
});

describe("curated color palettes meet WCAG AA for body text", () => {
  for (const palette of COLOR_PALETTES) {
    for (const field of ["colorText", "colorTextMuted"] as const) {
      it(`${palette.id}: ${field}`, () => {
        const colors = palette.colors as Record<string, string>;
        const ratio = contrastRatio(colors[field], colors.colorBackground);
        expect(ratio).not.toBeNull();
        expect(
          ratio!,
          `${palette.id} ${field} ${colors[field]} on ${colors.colorBackground} = ${ratio!.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      });
    }
  }
});

describe("featured link buttons", () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s: label meets AA contrast on the primary colour",
    (_id, template) => {
      const style = featuredLinkStyle(template.defaultTheme);
      expect(contrastRatio(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    },
  );
});
