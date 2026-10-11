// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InferSelectModel } from "drizzle-orm";
import type { blocks } from "@/lib/db/schema";
import { getTemplate } from "@/lib/templates";
import { PageFrame } from "./page-parts";
import { LinkBlock } from "@/components/blocks/link-block";

type Block = InferSelectModel<typeof blocks>;

const theme = getTemplate("clean-slate").defaultTheme;
const link = {
  id: "b1",
  pageId: "p1",
  type: "link",
  position: 0,
  label: "Free website plan",
  url: "https://example.com/",
  content: {},
  isVisible: true,
  createdAt: new Date(),
  updatedAt: new Date(),
} as Block;

describe("public page keyboard focus", () => {
  it("scopes every interactive element under .ln-page", () => {
    const html = renderToStaticMarkup(
      <PageFrame theme={theme} className="min-h-screen">
        <LinkBlock block={link} />
      </PageFrame>,
    );
    expect(html).toMatch(/<div class="ln-page min-h-screen"/);
  });

  // The halo class used to live on the anchor, where the inline box-shadow
  // silently beat it; it now comes from the stylesheet rule.
  it("does not carry the dead halo class on link blocks", () => {
    const html = renderToStaticMarkup(<LinkBlock block={link} />);
    expect(html).not.toContain("0_0_0_4px");
    expect(html).toContain("focus-visible:outline-2");
  });

  it("has one stylesheet rule for the ring and halo", () => {
    // jsdom gives import.meta.url an http scheme; vitest runs from the repo root.
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain(
      ".ln-page :is(a, button, input, select, textarea, summary, [tabindex]):focus-visible {",
    );
    expect(css).toContain("outline: 2px solid var(--ln-color-text);");
    expect(css).toContain("box-shadow: 0 0 0 4px var(--ln-color-bg) !important;");
  });
});
