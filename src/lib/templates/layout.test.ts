import { describe, it, expect } from "vitest";
import { gridPlacement, sizeOptions } from "./layout";

const block = (type: string, content: Record<string, unknown> = {}) => ({ type, content });

describe("gridPlacement", () => {
  it("spans full-width block types across both columns", () => {
    for (const type of ["header", "text", "divider", "socials"]) {
      expect(gridPlacement(block(type), "card-grid")).toEqual({ className: "col-span-2", tile: false });
    }
  });

  it("makes links and images tiles by default", () => {
    expect(gridPlacement(block("link"), "card-grid")).toEqual({ className: "", tile: true });
    expect(gridPlacement(block("image"), "bento-grid")).toEqual({ className: "", tile: true });
  });

  it("spans featured links and wide blocks", () => {
    expect(gridPlacement(block("link", { featured: true }), "card-grid").className).toBe("col-span-2");
    expect(gridPlacement(block("image", { size: "wide" }), "bento-grid").className).toBe("col-span-2");
  });

  it("honours tall only on bento", () => {
    expect(gridPlacement(block("link", { size: "tall" }), "bento-grid")).toEqual({ className: "row-span-2", tile: true });
    expect(gridPlacement(block("link", { size: "tall" }), "card-grid")).toEqual({ className: "", tile: true });
  });
});

describe("sizeOptions", () => {
  it("offers sizes only for links and images in grid layouts", () => {
    expect(sizeOptions("link", "bento-grid")).toEqual(["default", "wide", "tall"]);
    expect(sizeOptions("image", "card-grid")).toEqual(["default", "wide"]);
    expect(sizeOptions("text", "bento-grid")).toEqual([]);
    expect(sizeOptions("link", "centered-stack")).toEqual([]);
  });
});
