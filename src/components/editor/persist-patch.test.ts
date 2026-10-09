import { describe, it, expect, vi } from "vitest";
import { persistPatch, type EditorActions } from "./persist-patch";

function actions(overrides: Partial<EditorActions> = {}) {
  return {
    updateBlock: vi.fn(async () => ({})),
    updatePage: vi.fn(async () => ({})),
    updateBanner: vi.fn(async () => ({})),
    ...overrides,
  } satisfies EditorActions;
}

describe("persistPatch", () => {
  it("sends block patches to updateBlock", async () => {
    const a = actions();
    await persistPatch("p1", { kind: "block", id: "b1" }, { label: "Shop" }, a);
    expect(a.updateBlock).toHaveBeenCalledWith({ id: "b1", label: "Shop" });
    expect(a.updatePage).not.toHaveBeenCalled();
  });

  it("routes the banner to updateBanner and other page fields to updatePage", async () => {
    const a = actions();
    const banner = { text: "New album", url: null };
    expect(await persistPatch("p1", { kind: "page" }, { banner, title: "Me" }, a)).toEqual({ ok: true });
    expect(a.updateBanner).toHaveBeenCalledWith({ pageId: "p1", banner });
    expect(a.updatePage).toHaveBeenCalledWith({ pageId: "p1", title: "Me" });
  });

  it("does not call updatePage for a banner-only patch, including removal", async () => {
    const a = actions();
    await persistPatch("p1", { kind: "page" }, { banner: null }, a);
    expect(a.updateBanner).toHaveBeenCalledWith({ pageId: "p1", banner: null });
    expect(a.updatePage).not.toHaveBeenCalled();
  });

  it("hands the saved block back so server-derived fields can be applied", async () => {
    const saved = { id: "b1", type: "embed", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" };
    const a = actions({ updateBlock: vi.fn(async () => ({ block: saved })) });
    const onBlockSaved = vi.fn();
    await persistPatch("p1", { kind: "block", id: "b1" }, { url: "youtu.be/dQw4w9WgXcQ" }, a, onBlockSaved);
    expect(onBlockSaved).toHaveBeenCalledWith(saved);
  });

  it("reports the first refusal", async () => {
    const a = actions({ updateBanner: vi.fn(async () => ({ error: "Flagged link" })) });
    expect(await persistPatch("p1", { kind: "page" }, { banner: { text: "x", url: "https://bad/" }, bio: "b" }, a)).toEqual({
      ok: false,
      error: "Flagged link",
    });
    expect(a.updatePage).not.toHaveBeenCalled();
  });
});
