// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InferSelectModel } from "drizzle-orm";
import type { blocks as blocksSchema } from "@/lib/db/schema";
import { getTemplate } from "@/lib/templates";
import { BlockList } from "./block-list";
import { SaveCoordinator } from "./save-coordinator";
import { PendingOps } from "./pending-ops";

vi.mock("@/lib/actions/blocks", () => ({
  createBlock: vi.fn(),
  deleteBlock: vi.fn(),
  reorderBlocks: vi.fn(),
}));
vi.mock("next/link", () => ({ default: (p: { children: React.ReactNode }) => <a>{p.children}</a> }));

afterEach(cleanup);

type Block = InferSelectModel<typeof blocksSchema>;

function block(overrides: Partial<Block>): Block {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    pageId: "p1",
    type: "link",
    position: 0,
    label: "Free website plan",
    url: "https://example.com/",
    content: {},
    isVisible: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Block;
}

function renderList(blocks: Block[], layout: "centered-stack" | "card-grid" = "centered-stack") {
  const saves = new SaveCoordinator({ save: async () => ({ ok: true }) });
  const template = getTemplate(layout === "card-grid" ? "glass" : "clean-slate");
  const onBlocksChange = vi.fn();
  render(
    <BlockList
      pageId="p1"
      blocks={blocks}
      onBlocksChange={onBlocksChange}
      plan="pro"
      theme={template.defaultTheme}
      layout={template.layout}
      saves={saves}
      ops={new PendingOps()}
      onError={() => {}}
    />,
  );
  return { onBlocksChange, saves };
}

const first = block({ id: "00000000-0000-4000-8000-000000000001", position: 0, label: "First" });
const second = block({ id: "00000000-0000-4000-8000-000000000002", position: 1, label: "Second" });

describe("BlockList rows", () => {
  it("labels the move buttons with the block and disables the ends", () => {
    renderList([first, second]);
    const up = screen.getByRole("button", { name: 'Move "First" up' });
    const down = screen.getByRole("button", { name: 'Move "Second" down' });
    expect((up as HTMLButtonElement).disabled).toBe(true);
    expect((down as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: 'Move "First" down' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("flags a hidden block and offers Show", () => {
    renderList([first, { ...second, isVisible: false }]);
    expect(screen.getByText("Hidden — not on your page yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show" })).toBeTruthy();
    expect(screen.queryAllByText("Hidden — not on your page yet")).toHaveLength(1);
  });

  it("offers an insertion point at the top and between rows", () => {
    renderList([first, second]);
    expect(screen.getByRole("button", { name: "Insert at top" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Insert here" })).toHaveLength(1);
  });

  it("counts the description and warns about the two-line clamp on a tile", () => {
    const long = "x".repeat(60);
    renderList([{ ...first, content: { description: long } }], "card-grid");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("(60/200)")).toBeTruthy();
    expect(screen.getByText(/cut off on a half-width card/)).toBeTruthy();
  });

  it("does not warn for the same description on a full-width card", () => {
    const long = "x".repeat(60);
    renderList([{ ...first, content: { description: long } }]);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Shows up to 2 lines on your page.")).toBeTruthy();
  });
});
