import { describe, it, expect } from "vitest";
import { prepareBanner } from "./banner";

describe("prepareBanner", () => {
  it("accepts text with or without a link and normalizes the link", () => {
    expect(prepareBanner({ text: " New album out now ", url: null })).toEqual({
      banner: { text: "New album out now", url: null },
    });
    expect(prepareBanner({ text: "Shop", url: "https://shop.example" })).toEqual({
      banner: { text: "Shop", url: "https://shop.example/" },
    });
  });

  it("treats null as removing the banner", () => {
    expect(prepareBanner(null)).toEqual({ banner: null });
  });

  it("rejects empty or over-long text, unknown keys and unsafe links", () => {
    expect("error" in prepareBanner({ text: "  ", url: null })).toBe(true);
    expect("error" in prepareBanner({ text: "x".repeat(141), url: null })).toBe(true);
    expect("error" in prepareBanner({ text: "Hi", url: null, color: "red" })).toBe(true);
    expect("error" in prepareBanner({ text: "Hi", url: "javascript:alert(1)" })).toBe(true);
  });
});
