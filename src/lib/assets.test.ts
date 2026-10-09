import { describe, it, expect } from "vitest";
import { isOwnAssetUrl } from "./assets";

const BASE = "https://pub-abc.r2.dev";

describe("isOwnAssetUrl", () => {
  it("accepts objects under the public bucket URL", () => {
    expect(isOwnAssetUrl(`${BASE}/ws/1.webp`, BASE)).toBe(true);
    expect(isOwnAssetUrl(`${BASE}/ws/1.webp`, `${BASE}/`)).toBe(true);
  });

  it("rejects other hosts, lookalike prefixes and the bare base", () => {
    expect(isOwnAssetUrl("https://evil.example/ws/1.webp", BASE)).toBe(false);
    expect(isOwnAssetUrl("https://pub-abc.r2.dev.evil.example/1.webp", BASE)).toBe(false);
    expect(isOwnAssetUrl(`${BASE}/`, BASE)).toBe(false);
    expect(isOwnAssetUrl(BASE, BASE)).toBe(false);
  });

  it("rejects everything when the bucket is not configured", () => {
    expect(isOwnAssetUrl(`${BASE}/ws/1.webp`, undefined)).toBe(false);
    expect(isOwnAssetUrl(`${BASE}/ws/1.webp`, "")).toBe(false);
  });
});
