import { describe, expect, it, vi } from "vitest";

// next/font modules cannot execute outside the Next build; stand in for the
// one family the loader is asked for and leave the rest unmocked (never loaded).
vi.mock("./google-fonts/sora", () => ({
  WEIGHTS: ["400", "500", "700"],
  font: { className: "sora_x", style: { fontFamily: "'__Sora_x', '__Sora_Fallback_x'" } },
}));
vi.mock("./google-fonts/lato", () => {
  throw new Error("Lato is not self-hosted in this test");
});

import { genericFamily, googleFontId, resolveThemeFonts } from "./font-loader";

describe("resolveThemeFonts", () => {
  it("self-hosts a Google family and requests nothing remote", async () => {
    const fonts = await resolveThemeFonts({ fontHeading: "'Sora', sans-serif", fontBody: "Georgia, serif" });
    expect(fonts.heading).toEqual({ fontFamily: "'__Sora_x', '__Sora_Fallback_x'", className: "sora_x" });
    expect(fonts.body).toBeNull();
    expect(fonts.remoteUrl).toBeNull();
  });

  it("surfaces a family whose module fails to load instead of serving the wrong font", async () => {
    const fonts = await resolveThemeFonts({ fontHeading: "'Lato', sans-serif" }).catch(() => null);
    // A missing module is a build-time error, not a runtime one; the loader
    // surfaces it rather than silently serving the wrong font.
    expect(fonts).toBeNull();
  });

  it("requests nothing for system fonts", async () => {
    const fonts = await resolveThemeFonts({ fontHeading: "Georgia, serif", fontBody: "system-ui, sans-serif" });
    expect(fonts).toEqual({ heading: null, body: null, remoteUrl: null });
  });

  it("maps theme values to font ids and keeps the generic family", () => {
    expect(googleFontId("'Sora', sans-serif")).toBe("sora");
    expect(googleFontId("Georgia, serif")).toBeNull();
    expect(genericFamily("'Sora', sans-serif")).toBe("sans-serif");
    expect(genericFamily("'Crimson Text', serif")).toBe("serif");
    expect(genericFamily(undefined)).toBe("sans-serif");
  });
});
