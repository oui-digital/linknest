import { describe, expect, it } from "vitest";
import { LANGUAGES, LANGUAGE_CODES, isRtl, pageLanguage } from "./languages";

describe("languages", () => {
  it("lists unique, well-formed BCP-47 tags", () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/);
    expect(LANGUAGE_CODES).toContain("fr");
  });

  it("knows which scripts run right to left", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("he")).toBe(true);
    expect(isRtl("fr")).toBe(false);
    expect(isRtl("pt-BR")).toBe(false);
  });

  it("falls back to English for unknown or missing values", () => {
    expect(pageLanguage("fr")).toBe("fr");
    expect(pageLanguage("xx")).toBe("en");
    expect(pageLanguage(null)).toBe("en");
  });
});
