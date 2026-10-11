// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InferSelectModel } from "drizzle-orm";
import type { blocks as blocksSchema } from "@/lib/db/schema";
import { getTemplate } from "@/lib/templates";
import { BlockRuntimeProvider } from "@/components/blocks/block-runtime";
import { BlockLayout } from "./page-parts";

type Block = InferSelectModel<typeof blocksSchema>;

const theme = getTemplate("clean-slate").defaultTheme;

function block(overrides: Partial<Block>): Block {
  return {
    id: "b1",
    pageId: "p1",
    type: "link",
    position: 0,
    label: "Link",
    url: "https://example.com/",
    content: {},
    isVisible: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Block;
}

function render(blocks: Block[], mode: "public" | "preview") {
  return renderToStaticMarkup(
    <BlockRuntimeProvider value={{ mode, pageId: "p1", pageTitle: "Demo", cta: { background: "#000", color: "#fff" } }}>
      <BlockLayout layout="centered-stack" blocks={blocks} theme={theme} mode={mode} />
    </BlockRuntimeProvider>,
  );
}

describe("BlockLayout block markers", () => {
  const withUrl = block({ id: "a", position: 0 });
  // A link without a URL renders nothing; it must not leave a wrapper behind.
  const withoutUrl = block({ id: "b", position: 1, url: null });

  it("adds no wrapper and no marker to public markup", () => {
    const html = render([withUrl, withoutUrl], "public");
    expect(html).not.toContain("data-block-id");
    // The column holds exactly one child: the rendered link.
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).not.toMatch(/<div class="w-full"><\/div>/);
  });

  it("marks every block in preview mode so the editor can scroll to it", () => {
    const html = render([withUrl, withoutUrl], "preview");
    expect(html).toContain('data-block-id="a"');
    expect(html).toContain('data-block-id="b"');
  });

  it("keeps the hidden-block treatment in preview only", () => {
    const hidden = block({ id: "h", position: 2, isVisible: false });
    expect(render([hidden], "public")).toBe('<div class="flex flex-col" style="gap:var(--ln-block-gap);align-items:center;--ln-justify:center"></div>');
    const preview = render([hidden], "preview");
    expect(preview).toContain('data-block-id="h"');
    expect(preview).toContain("Hidden");
  });
});
