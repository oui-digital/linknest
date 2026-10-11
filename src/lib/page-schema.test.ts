import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updatePageSchema } from "./page-schema";

const PAGE_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => vi.stubEnv("R2_PUBLIC_URL", "https://assets.linknest.click"));
afterEach(() => vi.unstubAllEnvs());

describe("updatePageSchema", () => {
  it("accepts own uploads and an empty string for every image field", () => {
    for (const field of ["avatarUrl", "ogImageUrl", "faviconUrl"]) {
      expect(updatePageSchema.safeParse({ pageId: PAGE_ID, [field]: "https://assets.linknest.click/ws/x.jpg" }).success, field).toBe(true);
      expect(updatePageSchema.safeParse({ pageId: PAGE_ID, [field]: "" }).success, field).toBe(true);
    }
  });

  // A third-party image is an unscanned destination and a tracking pixel.
  it("rejects third-party image URLs", () => {
    for (const field of ["avatarUrl", "ogImageUrl", "faviconUrl"]) {
      expect(updatePageSchema.safeParse({ pageId: PAGE_ID, [field]: "https://evil.example/x.jpg" }).success, field).toBe(false);
    }
  });

  it("accepts only listed languages and entity kinds", () => {
    expect(updatePageSchema.safeParse({ pageId: PAGE_ID, language: "fr" }).success).toBe(true);
    expect(updatePageSchema.safeParse({ pageId: PAGE_ID, language: "xx" }).success).toBe(false);
    expect(updatePageSchema.safeParse({ pageId: PAGE_ID, entityKind: "organization" }).success).toBe(true);
    expect(updatePageSchema.safeParse({ pageId: PAGE_ID, entityKind: "robot" }).success).toBe(false);
  });

  it("bounds the avatar description", () => {
    expect(updatePageSchema.safeParse({ pageId: PAGE_ID, avatarAlt: "x".repeat(255) }).success).toBe(true);
    expect(updatePageSchema.safeParse({ pageId: PAGE_ID, avatarAlt: "x".repeat(256) }).success).toBe(false);
  });
});
