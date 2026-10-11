import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { blocks, pages, subscribers } from "@/lib/db/schema";
import { applyLiveEdit } from "@/lib/live-edit";
import { duplicatePageCore, copySlugCandidate, copyTitle } from "@/lib/duplicate-page";
import { insertPageInWorkspace, PAGE_LIMIT_ERROR } from "@/lib/page-create";
import { countConfirmed } from "@/lib/subscribers";
import { createTestDb, fakeCheckUrls, seedOwnedPage, truncateAll, warmPool } from "./helpers";

const { db, pool } = createTestDb();
beforeAll(() => warmPool(pool, 6));
beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

const LINKS = ["https://a.example/", "https://b.example/"];

async function pagesOf(workspaceId: string) {
  return db.select().from(pages).where(eq(pages.workspaceId, workspaceId)).orderBy(asc(pages.createdAt));
}

async function blocksOf(pageId: string) {
  return db.select().from(blocks).where(eq(blocks.pageId, pageId)).orderBy(asc(blocks.position));
}

describe("duplicatePageCore", () => {
  it("copies content and settings into a draft with fresh ids", async () => {
    const { page, workspace } = await seedOwnedPage(db, { plan: "pro", isPublished: true, links: LINKS });
    await db
      .update(pages)
      .set({
        language: "fr",
        entityKind: "organization",
        avatarAlt: "Le studio",
        theme: { colorPrimary: "#112233" },
        banner: { text: "Hello", url: null },
        seoTitle: "SEO",
        seoDescription: "Desc",
        contentVersion: 7,
      })
      .where(eq(pages.id, page.id));
    await db.insert(blocks).values({ pageId: page.id, type: "email_capture", position: 2, content: {} });
    await db.insert(subscribers).values({
      workspaceId: workspace.id,
      pageId: page.id,
      email: "a@example.test",
      emailCanonical: "a@example.test",
      status: "confirmed",
      consentText: "x",
    });

    const result = await duplicatePageCore(db, { pageId: page.id, workspaceId: workspace.id });
    expect(result).toHaveProperty("pageId");
    const copyId = (result as { pageId: string }).pageId;

    const [source, copy] = await pagesOf(workspace.id);
    expect(copy.id).toBe(copyId);
    expect(copy.slug).toBe(`${source.slug}-copy`);
    expect(copy.title).toBe(`${source.title} (copy)`);
    expect(copy.isPublished).toBe(false);
    expect(copy.publishedAt).toBeNull();
    expect(copy.firstPublishedAt).toBeNull();
    expect(copy.contentVersion).toBe(0);
    expect(copy.createdAt.getTime()).toBeGreaterThan(source.createdAt.getTime());
    expect(copy).toMatchObject({
      language: "fr",
      entityKind: "organization",
      avatarAlt: "Le studio",
      theme: { colorPrimary: "#112233" },
      banner: { text: "Hello", url: null },
      seoTitle: "SEO",
      seoDescription: "Desc",
      templateId: source.templateId,
    });

    const sourceBlocks = await blocksOf(source.id);
    const copyBlocks = await blocksOf(copy.id);
    expect(copyBlocks.map((b) => [b.type, b.position, b.label, b.url, b.isVisible])).toEqual(
      sourceBlocks.map((b) => [b.type, b.position, b.label, b.url, b.isVisible]),
    );
    expect(new Set(copyBlocks.map((b) => b.id)).size).toBe(copyBlocks.length);
    for (const b of copyBlocks) expect(sourceBlocks.map((s) => s.id)).not.toContain(b.id);

    // The list is per workspace: copying an email sign-up block copies nothing.
    expect(await countConfirmed(db, workspace.id)).toBe(1);
    expect(await db.select().from(subscribers).where(eq(subscribers.pageId, copy.id))).toHaveLength(0);
  });

  it("numbers successive copies and skips a taken candidate", async () => {
    const { page, workspace } = await seedOwnedPage(db, { plan: "pro" });

    const first = await duplicatePageCore(db, { pageId: page.id, workspaceId: workspace.id });
    const second = await duplicatePageCore(db, { pageId: page.id, workspaceId: workspace.id });
    expect(first).toHaveProperty("pageId");
    expect(second).toHaveProperty("pageId");

    const slugs = (await pagesOf(workspace.id)).map((p) => p.slug);
    expect(slugs).toEqual([page.slug, `${page.slug}-copy`, `${page.slug}-copy-2`]);
  });

  it("keeps the slug within 63 characters and the title within 255", async () => {
    expect(copySlugCandidate("a".repeat(63), 0)).toHaveLength(63);
    expect(copySlugCandidate("a".repeat(63), 0).endsWith("-copy")).toBe(true);
    expect(copySlugCandidate("a".repeat(63), 1).endsWith("-copy-2")).toBe(true);
    expect(copyTitle("t".repeat(255))).toHaveLength(255);
    expect(copyTitle("t".repeat(255)).endsWith(" (copy)")).toBe(true);
  });

  it("refuses at the page limit and leaves no row behind", async () => {
    const { page, workspace } = await seedOwnedPage(db, { plan: "free" });
    const result = await duplicatePageCore(db, { pageId: page.id, workspaceId: workspace.id });
    expect(result).toEqual({ error: PAGE_LIMIT_ERROR });
    expect(await pagesOf(workspace.id)).toHaveLength(1);
  });

  it("refuses a page from another workspace", async () => {
    const mine = await seedOwnedPage(db, { plan: "pro" });
    const theirs = await seedOwnedPage(db, { plan: "pro" });
    const result = await duplicatePageCore(db, { pageId: theirs.page.id, workspaceId: mine.workspace.id });
    expect(result).toEqual({ error: "Page not found" });
    expect(await pagesOf(mine.workspace.id)).toHaveLength(1);
  });

  // Regression target: the quota used to be checked outside any lock, so two
  // creations at four of five pages could both pass and leave six.
  it("lets exactly one of two concurrent copies through at four of five pages", async () => {
    const owned = await seedOwnedPage(db, { plan: "pro" });
    for (let i = 0; i < 3; i++) {
      await insertPageInWorkspace(db, {
        workspaceId: owned.workspace.id,
        values: { slug: `extra-${i}-${owned.page.slug}`, title: `Extra ${i}` },
      });
    }
    expect(await pagesOf(owned.workspace.id)).toHaveLength(4);

    const results = await Promise.all([
      duplicatePageCore(db, { pageId: owned.page.id, workspaceId: owned.workspace.id }),
      duplicatePageCore(db, { pageId: owned.page.id, workspaceId: owned.workspace.id }),
    ]);
    const ok = results.filter((r) => "pageId" in r);
    expect(ok).toHaveLength(1);
    expect(await pagesOf(owned.workspace.id)).toHaveLength(5);
  });

  it("lets exactly one of a copy and a plain create through at four of five pages", async () => {
    const owned = await seedOwnedPage(db, { plan: "pro" });
    for (let i = 0; i < 3; i++) {
      await insertPageInWorkspace(db, {
        workspaceId: owned.workspace.id,
        values: { slug: `extra-${i}-${owned.page.slug}`, title: `Extra ${i}` },
      });
    }

    const results = await Promise.all([
      duplicatePageCore(db, { pageId: owned.page.id, workspaceId: owned.workspace.id }),
      insertPageInWorkspace(db, {
        workspaceId: owned.workspace.id,
        values: { slug: `fresh-${owned.page.slug}`, title: "Fresh" },
      }),
    ]);
    const ok = results.filter((r) => "pageId" in r || "page" in r);
    expect(ok).toHaveLength(1);
    expect(await pagesOf(owned.workspace.id)).toHaveLength(5);
  });

  it("copies either all of a concurrent edit or none of it", async () => {
    const { page, workspace } = await seedOwnedPage(db, { plan: "pro", links: LINKS });
    const [first] = await blocksOf(page.id);

    // The edit takes the page lock; the duplicate waits for it (or vice versa).
    const edit = applyLiveEdit(db, {
      pageId: page.id,
      introducedUrls: [],
      checkUrls: fakeCheckUrls(),
      write: async (tx) => {
        const [row] = await tx
          .update(blocks)
          .set({ label: "edited" })
          .where(eq(blocks.id, first.id))
          .returning();
        await tx.insert(blocks).values({ pageId: page.id, type: "text", position: 2, label: "added" });
        return row;
      },
    });
    const copy = duplicatePageCore(db, { pageId: page.id, workspaceId: workspace.id });
    const [editResult, copyResult] = await Promise.all([edit, copy]);
    expect(editResult.ok).toBe(true);
    expect(copyResult).toHaveProperty("pageId");

    const copied = await blocksOf((copyResult as { pageId: string }).pageId);
    const sawEdit = copied.some((b) => b.label === "edited");
    const sawAdd = copied.some((b) => b.label === "added");
    expect(sawEdit).toBe(sawAdd);
  });
});
