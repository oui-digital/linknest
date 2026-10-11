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

function renderList(
  blocks: Block[],
  layout: "centered-stack" | "card-grid" = "centered-stack",
  counts: { days: number; blocks: Record<string, { clicks: number; plays: number }> } | null = null,
) {
  const saves = new SaveCoordinator({ save: async () => ({ ok: true }) });
  const template = getTemplate(layout === "card-grid" ? "glass" : "clean-slate");
  const onBlocksChange = vi.fn();
  let editingId: string | null = null;
  const tree = (id: string | null) => (
    <BlockList
      pageId="p1"
      blocks={blocks}
      onBlocksChange={onBlocksChange}
      plan="pro"
      theme={template.defaultTheme}
      layout={template.layout}
      saves={saves}
      ops={new PendingOps()}
      editingId={id}
      onEditingChange={(id) => {
        editingId = id;
        view.rerender(tree(id));
      }}
      counts={counts}
      onError={() => {}}
    />
  );
  const view = render(tree(editingId));
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

describe("BlockList click chips", () => {
  it("shows clicks for links and plays for embeds only when data is present", () => {
    const embed = block({ id: "00000000-0000-4000-8000-000000000003", position: 2, type: "embed", label: "Talk", url: "https://youtube.com/watch?v=x", content: { provider: "youtube", embedId: "x" } });
    renderList([first, second, embed], "centered-stack", {
      days: 7,
      blocks: {
        [first.id]: { clicks: 12, plays: 0 },
        [second.id]: { clicks: 0, plays: 0 },
        [embed.id]: { clicks: 0, plays: 3 },
      },
    });
    expect(screen.getByText("12 clicks · 7d")).toBeTruthy();
    expect(screen.getByText("0 clicks · 7d")).toBeTruthy();
    expect(screen.getByText("3 plays · 7d")).toBeTruthy();
  });

  it("renders no chip at all without analytics data", () => {
    renderList([first, second]);
    expect(screen.queryByText(/clicks · /)).toBeNull();
  });
});
