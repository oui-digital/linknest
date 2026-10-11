import { describe, expect, it } from "vitest";
import { descriptionHint } from "./description-hint";

const chars = (n: number) => "x".repeat(n);

describe("descriptionHint", () => {
  it("counts characters against the schema maximum", () => {
    expect(descriptionHint("hello", { tile: false })).toMatchObject({ count: 5, max: 200 });
    expect(descriptionHint("", { tile: true })).toMatchObject({ count: 0, warn: false });
  });

  it("warns earlier on a half-width tile than on a full-width card", () => {
    expect(descriptionHint(chars(40), { tile: true }).warn).toBe(false);
    expect(descriptionHint(chars(60), { tile: true }).warn).toBe(true);
    expect(descriptionHint(chars(60), { tile: false }).warn).toBe(false);
    expect(descriptionHint(chars(120), { tile: false }).warn).toBe(true);
  });

  it("warns when typed line breaks exceed the two-line clamp", () => {
    expect(descriptionHint("a\nb", { tile: false }).warn).toBe(false);
    expect(descriptionHint("a\nb\nc", { tile: false }).warn).toBe(true);
  });
});
