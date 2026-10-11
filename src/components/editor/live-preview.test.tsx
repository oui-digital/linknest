// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InferSelectModel } from "drizzle-orm";
import type { blocks as blocksSchema, pages } from "@/lib/db/schema";
import { getTemplate } from "@/lib/templates";
import { LivePreview } from "./live-preview";

type Page = InferSelectModel<typeof pages>;
type Block = InferSelectModel<typeof blocksSchema>;

const page = {
  id: "p1",
  slug: "demo",
  title: "Demo",
  bio: null,
  avatarUrl: null,
  templateId: "clean-slate",
  theme: {},
  banner: null,
  isPublished: true,
} as unknown as Page;

function link(id: string, position: number): Block {
  return {
    id,
    pageId: "p1",
    type: "link",
    position,
    label: `Link ${position}`,
    url: "https://example.com/",
    content: {},
    isVisible: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Block;
}

const theme = getTemplate("clean-slate").defaultTheme;
const blocks = Array.from({ length: 8 }, (_, i) => link(`b${i}`, i));

let frameScrollTo: ReturnType<typeof vi.fn>;
let elementScrollIntoView: ReturnType<typeof vi.fn>;

beforeEach(() => {
  frameScrollTo = vi.fn();
  elementScrollIntoView = vi.fn();
  Element.prototype.scrollTo = frameScrollTo as unknown as Element["scrollTo"];
  Element.prototype.scrollIntoView = elementScrollIntoView as unknown as Element["scrollIntoView"];
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe("LivePreview scroll-to-block", () => {
  it("scrolls the phone frame, never an ancestor, when a block is being edited", () => {
    const view = render(<LivePreview page={page} blocks={blocks} theme={theme} activeBlockId={null} />);
    expect(frameScrollTo).not.toHaveBeenCalled();

    act(() => {
      view.rerender(<LivePreview page={page} blocks={blocks} theme={theme} activeBlockId="b7" />);
    });
    expect(frameScrollTo).toHaveBeenCalledTimes(1);
    expect(frameScrollTo.mock.calls[0][0]).toMatchObject({ behavior: "smooth" });
    expect(elementScrollIntoView).not.toHaveBeenCalled();

    const target = document.querySelector('[data-block-id="b7"]') as HTMLElement;
    expect(target.style.outline).toContain("2px solid");

    act(() => {
      view.rerender(<LivePreview page={page} blocks={blocks} theme={theme} activeBlockId="b2" />);
    });
    expect(frameScrollTo).toHaveBeenCalledTimes(2);
  });

  it("jumps instead of animating under reduced motion", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    render(<LivePreview page={page} blocks={blocks} theme={theme} activeBlockId="b3" />);
    expect(frameScrollTo.mock.calls[0][0]).toMatchObject({ behavior: "auto" });
  });
});
