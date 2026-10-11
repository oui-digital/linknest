// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InferSelectModel } from "drizzle-orm";
import type { blocks } from "@/lib/db/schema";
import { TextBlock } from "./text-block";

type Block = InferSelectModel<typeof blocks>;

function textBlock(content: Record<string, unknown>): Block {
  return {
    id: "t1",
    pageId: "p1",
    type: "text",
    position: 0,
    label: null,
    url: null,
    content,
    isVisible: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Block;
}

describe("TextBlock", () => {
  it("renders a paragraph by default", () => {
    const html = renderToStaticMarkup(<TextBlock block={textBlock({ text: "Hello" })} />);
    expect(html).toMatch(/^<p /);
    expect(html).toContain("Hello");
  });

  // A testimonial in a div told nobody it was a quotation.
  it("renders a quote as a blockquote with a start-side rule", () => {
    const html = renderToStaticMarkup(
      <TextBlock block={textBlock({ text: "Beyond expectations", variant: "quote" })} />,
    );
    expect(html).toMatch(/^<blockquote /);
    expect(html).toContain("border-inline-start");
    expect(html).not.toContain("<p");
  });
});
