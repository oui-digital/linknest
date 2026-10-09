import { describe, it, expect } from "vitest";
import { extractScannableUrls } from "./block-urls";

describe("extractScannableUrls", () => {
  it("returns the url column when set", () => {
    expect(extractScannableUrls({ type: "link", url: "https://a.example/", content: {} })).toEqual([
      "https://a.example/",
    ]);
  });

  it("returns nothing for blocks without a destination", () => {
    expect(extractScannableUrls({ type: "header", url: null, content: {} })).toEqual([]);
    expect(extractScannableUrls({ type: "link", url: "", content: null })).toEqual([]);
  });

  it("does not treat an uploaded image as a destination", () => {
    expect(
      extractScannableUrls({ type: "image", url: null, content: { imageUrl: "https://cdn.example/a.webp" } }),
    ).toEqual([]);
  });
});
