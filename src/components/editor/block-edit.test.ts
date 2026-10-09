import { describe, it, expect } from "vitest";
import { applyBlockEdit, restoreBlock } from "./block-edit";

const block = (id: string, content: Record<string, unknown>, position = 0) =>
  ({ id, type: "image", position, label: null, url: null, isVisible: true, content }) as never;

describe("applyBlockEdit", () => {
  // Regression: an upload finishing after another edit wrote back the content
  // captured when the upload started, erasing the newer edit.
  it("merges a content patch onto the latest content, keeping newer edits", () => {
    const latest = [block("a", { alt: "Edited while uploading" })];
    const { blocks, content } = applyBlockEdit(latest, "a", {}, { imageUrl: "https://cdn/x.webp" });
    expect(content).toEqual({ alt: "Edited while uploading", imageUrl: "https://cdn/x.webp" });
    expect((blocks[0] as { content: unknown }).content).toEqual(content);
  });

  it("removes keys patched to undefined", () => {
    const { content } = applyBlockEdit([block("a", { alt: "x", imageUrl: "u" })], "a", {}, { imageUrl: undefined });
    expect(content).toEqual({ alt: "x" });
  });

  it("leaves other blocks and unknown ids untouched", () => {
    const list = [block("a", {}), block("b", { alt: "b" })];
    expect(applyBlockEdit(list, "zzz", { label: "x" }).blocks).toBe(list);
    expect(applyBlockEdit(list, "a", { label: "x" }).blocks[1]).toBe(list[1]);
  });
});

describe("restoreBlock", () => {
  it("puts a refused deletion back in position order", () => {
    const list = [block("a", {}, 0), block("c", {}, 2)];
    expect(restoreBlock(list, block("b", {}, 1)).map((b: { id: string }) => b.id)).toEqual(["a", "b", "c"]);
  });
});

describe("applyBlockEdit with style patches", () => {
  // Regression (QA recheck): two colour changes within 500 ms; the second
  // callback was created before the first landed and replaced the whole
  // styleOverrides object, losing the first colour.
  it("keeps both colours when they are patched one after the other", () => {
    let list: Parameters<typeof applyBlockEdit>[0] = [block("a", { styleOverrides: { variant: "outline" } })];
    list = applyBlockEdit(list, "a", {}, undefined, { bgColor: "#111111" }).blocks;
    const { content } = applyBlockEdit(list, "a", {}, undefined, { textColor: "#EEEEEE" });
    expect(content).toEqual({
      styleOverrides: { variant: "outline", bgColor: "#111111", textColor: "#EEEEEE" },
    });
  });

  it("removes a style key patched to undefined, and the object when empty", () => {
    const list = [block("a", { alt: "x", styleOverrides: { variant: "outline" } })];
    expect(applyBlockEdit(list, "a", {}, undefined, { variant: undefined }).content).toEqual({ alt: "x" });
  });
});
