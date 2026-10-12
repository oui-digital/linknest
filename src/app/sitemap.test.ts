import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/sitemap-pages", () => ({ listIndexablePages: vi.fn(async () => []) }));

import sitemap from "./sitemap";
import { SITE_URL } from "@/lib/site";

describe("marketing sitemap", () => {
  it("lists only canonical marketing feature URLs", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    for (const path of ["/pricing", "/features", "/features/email-capture", "/features/link-analytics", "/features/embeds", "/features/customization", "/features/open-in-browser"]) {
      expect(urls).toContain(`${SITE_URL}${path}`);
    }
    expect(urls.some((url) => url.includes("/@features"))).toBe(false);
  });
});
