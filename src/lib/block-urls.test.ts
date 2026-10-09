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

describe("extractScannableUrls for social icons", () => {
  it("returns every icon's destination", () => {
    expect(
      extractScannableUrls({
        type: "socials",
        url: null,
        content: {
          items: [
            { platform: "instagram", url: "https://www.instagram.com/a/" },
            { platform: "x", url: "https://x.com/a" },
            { platform: "x", url: "https://x.com/a" },
          ],
        },
      }),
    ).toEqual(["https://www.instagram.com/a/", "https://x.com/a"]);
  });

  it("ignores malformed items rather than failing", () => {
    expect(
      extractScannableUrls({ type: "socials", url: null, content: { items: [{ nope: 1 }, { platform: "x", url: "https://x.com/b" }] } }),
    ).toEqual(["https://x.com/b"]);
  });
});

describe("extractScannableUrls for embeds", () => {
  it("scans the canonical provider link but never the stored cover", () => {
    expect(
      extractScannableUrls({
        type: "embed",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        content: { provider: "youtube", embedId: "dQw4w9WgXcQ", coverUrl: "https://cdn.example/c.webp" },
      }),
    ).toEqual(["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]);
  });
});
