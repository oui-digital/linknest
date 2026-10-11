import { and, asc, eq } from "drizzle-orm";
import { blocks, pages } from "@/lib/db/schema";
import type { Db, Tx } from "@/lib/db/types";
import { isReservedSlug, validateSlug } from "@/lib/slugs";
import { insertPageInWorkspace } from "@/lib/page-create";

export const COPY_TITLE_SUFFIX = " (copy)";
export const SLUG_MAX = 63;
const MAX_ATTEMPTS = 5;

export const DUPLICATE_SLUG_ERROR = "Couldn't pick a free address for the copy. Please try again.";

/**
 * Copy a page and its blocks into the same workspace as a draft.
 *
 * What is copied: the page's content and settings (title, bio, avatar and its
 * alt text, template, theme overrides, SEO fields, banner, language, entity
 * kind, social image, favicon) and every block in order, with fresh ids.
 *
 * What is not: the published state (the copy is a draft with no publish
 * dates and a fresh content version), subscribers (the list is per workspace,
 * so an email sign-up block on the copy feeds the same list and copies
 * nothing), analytics (keyed by the new block ids and slug), moderation
 * history, and asset rows (the copy references the same R2 URLs).
 *
 * Consistency: the source page row is locked FOR UPDATE first — the same lock
 * every block write takes in applyLiveEdit — so no edit can land between
 * reading the page and reading its blocks. The workspace row is locked by
 * insertPageInWorkspace, which also enforces the page limit.
 *
 * Slug: `<source>-copy`, then `-copy-2`, … The candidate is checked inside
 * the transaction; a competing claim that slips through still hits the unique
 * index, which aborts the transaction, so the whole thing is retried with the
 * next candidate a bounded number of times.
 */
export async function duplicatePageCore(
  db: Db,
  { pageId, workspaceId }: { pageId: string; workspaceId: string },
): Promise<{ pageId: string } | { error: string }> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [source] = await tx
          .select()
          .from(pages)
          .where(and(eq(pages.id, pageId), eq(pages.workspaceId, workspaceId)))
          .for("update");
        if (!source) return { error: "Page not found" };

        const sourceBlocks = await tx
          .select()
          .from(blocks)
          .where(eq(blocks.pageId, source.id))
          .orderBy(asc(blocks.position));

        const slug = await freeCopySlug(tx, source.slug, attempt);
        if (!slug) return { error: DUPLICATE_SLUG_ERROR };

        const result = await insertPageInWorkspace(db, {
          tx,
          workspaceId,
          values: {
            slug,
            title: copyTitle(source.title),
            bio: source.bio,
            avatarUrl: source.avatarUrl,
            avatarAlt: source.avatarAlt,
            templateId: source.templateId,
            theme: source.theme,
            seoTitle: source.seoTitle,
            seoDescription: source.seoDescription,
            banner: source.banner,
            language: source.language,
            entityKind: source.entityKind,
            ogImageUrl: source.ogImageUrl,
            faviconUrl: source.faviconUrl,
            isPublished: false,
            publishedAt: null,
            firstPublishedAt: null,
            contentVersion: 0,
          },
          blocks: sourceBlocks.map((block) => ({
            type: block.type,
            position: block.position,
            label: block.label,
            url: block.url,
            content: block.content,
            isVisible: block.isVisible,
          })),
        });
        if ("error" in result) return result;
        return { pageId: result.page.id };
      });
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  return { error: DUPLICATE_SLUG_ERROR };
}

/** `<title> (copy)`, with the title trimmed so the suffix always fits in 255. */
export function copyTitle(title: string): string {
  return `${title.slice(0, 255 - COPY_TITLE_SUFFIX.length)}${COPY_TITLE_SUFFIX}`;
}

/** The n-th slug candidate: `<base>-copy`, `<base>-copy-2`, … within 63 chars. */
export function copySlugCandidate(sourceSlug: string, index: number): string {
  const suffix = index === 0 ? "-copy" : `-copy-${index + 1}`;
  const base = sourceSlug.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, "");
  return `${base}${suffix}`;
}

async function freeCopySlug(tx: Tx, sourceSlug: string, startAt: number): Promise<string | null> {
  for (let i = startAt; i < startAt + MAX_ATTEMPTS; i++) {
    const candidate = copySlugCandidate(sourceSlug, i);
    if (!validateSlug(candidate).valid || isReservedSlug(candidate)) continue;
    const [taken] = await tx
      .select({ id: pages.id })
      .from(pages)
      .where(eq(pages.slug, candidate))
      .limit(1);
    if (!taken) return candidate;
  }
  return null;
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } })?.code
    ?? (error as { cause?: { code?: string } })?.cause?.code;
  if (code === "23505") return true;
  const message = error instanceof Error ? error.message : "";
  return message.includes("duplicate key") || message.includes("unique");
}
