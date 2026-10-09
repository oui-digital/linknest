import { describe, it, expect } from "vitest";
import {
  blockContentWriters,
  blockContentWriterFor,
  isBlockType,
  parseBlockContent,
} from "./content";

describe("block content writers", () => {
  it("accept the shapes the editor has always written", () => {
    expect(blockContentWriters.link.safeParse({ styleOverrides: { variant: "outline" } }).success).toBe(true);
    expect(blockContentWriters.text.safeParse({ text: "hello" }).success).toBe(true);
    expect(blockContentWriters.image.safeParse({ imageUrl: "https://cdn.example/a.webp", alt: "A" }).success).toBe(true);
    expect(blockContentWriters.header.safeParse({}).success).toBe(true);
    expect(blockContentWriters.divider.safeParse({}).success).toBe(true);
  });

  it("reject unknown keys, including another type's keys", () => {
    expect(blockContentWriters.text.safeParse({ text: "a", bogus: 1 }).success).toBe(false);
    expect(blockContentWriters.link.safeParse({ text: "a" }).success).toBe(false);
    expect(blockContentWriters.image.safeParse({ styleOverrides: { glitter: true } }).success).toBe(false);
  });

  it("reject values that could not render", () => {
    expect(blockContentWriters.text.safeParse({ text: { nested: true } }).success).toBe(false);
    expect(blockContentWriters.text.safeParse({ text: "x".repeat(5001) }).success).toBe(false);
  });

  it("are reachable by runtime type name", () => {
    expect(blockContentWriterFor("text").safeParse({ text: "ok" }).success).toBe(true);
    expect(isBlockType("text")).toBe(true);
    expect(isBlockType("carousel")).toBe(false);
  });
});

describe("parseBlockContent", () => {
  it("returns the stored content when it is well-formed", () => {
    expect(parseBlockContent("text", { text: "hello", styleOverrides: { variant: "subtle" } })).toEqual({
      text: "hello",
      styleOverrides: { variant: "subtle" },
    });
  });

  // Regression guard: an unknown key must not blank the block.
  it("keeps the known keys when an unknown key is present", () => {
    expect(parseBlockContent("text", { text: "hello", legacyFlag: true })).toEqual({ text: "hello" });
  });

  it("salvages the valid fields when one value is invalid", () => {
    expect(parseBlockContent("image", { imageUrl: 42, alt: "A caption" })).toEqual({ alt: "A caption" });
  });

  it("reads null, arrays, strings and unknown types as empty", () => {
    expect(parseBlockContent("text", null)).toEqual({});
    expect(parseBlockContent("text", ["x"])).toEqual({});
    expect(parseBlockContent("text", "x")).toEqual({});
    expect(parseBlockContent("carousel", { text: "x" })).toEqual({});
  });
});

describe("socials content", () => {
  const item = { platform: "instagram", url: "https://www.instagram.com/a/" };

  it("writer accepts known platforms and rejects unknown ones or too many items", () => {
    expect(blockContentWriters.socials.safeParse({ items: [item] }).success).toBe(true);
    expect(blockContentWriters.socials.safeParse({ items: [{ ...item, platform: "mastodon" }] }).success).toBe(false);
    expect(blockContentWriters.socials.safeParse({ items: Array(21).fill(item) }).success).toBe(false);
    expect(blockContentWriters.socials.safeParse({ items: [{ ...item, extra: 1 }] }).success).toBe(false);
  });

  it("reader keeps the valid icons when one is broken", () => {
    expect(parseBlockContent("socials", { items: [item, { platform: "nope", url: "x" }] })).toEqual({
      items: [item],
    });
  });
});
