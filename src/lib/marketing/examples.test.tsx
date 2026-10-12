import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ExamplePage } from "@/components/marketing/example-page";

describe("embedded marketing examples", () => {
  it.each(["creator", "service", "multi"] as const)("keeps %s destinations and actions inert", (kind) => {
    const html = renderToStaticMarkup(<ExamplePage kind={kind} />);
    expect(html).not.toMatch(/<a\b|<iframe\b|<main\b|<h1\b/i);
    expect(html).not.toContain("data-link-id=");
    expect(html).toContain("<h3");
    if (kind === "creator") expect(html).toMatch(/disabled=""[^>]*aria-label="Dismiss announcement"|aria-label="Dismiss announcement"[^>]*disabled=""/);
    if (html.includes("<form")) expect(html).toContain("<fieldset disabled");
  });
});
