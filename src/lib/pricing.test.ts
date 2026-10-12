import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRICE_MONTHLY, PRICE_YEARLY, YEARLY_SAVINGS_PERCENT } from "./pricing";

describe("marketing pricing", () => {
  it("derives the annual savings from the plan prices", () => {
    expect(YEARLY_SAVINGS_PERCENT).toBe(
      Math.round((1 - PRICE_YEARLY / (PRICE_MONTHLY * 12)) * 100),
    );
  });

  it("keeps price and savings literals out of marketing cards", () => {
    for (const file of [
      "src/components/marketing/pricing-preview.tsx",
      "src/app/(main)/(marketing)/pricing/pricing-cards.tsx",
    ]) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/\$8\b|\$72\b|save 25%/i);
    }
  });
});
