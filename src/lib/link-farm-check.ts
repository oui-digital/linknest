import { after } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db as appDb } from "@/lib/db";
import { blocks, pageModerationLog, pages } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { escapeHtml, sendAdminAlert } from "@/lib/email";
import { extractLinkHosts, worstSharedHost } from "@/lib/link-farm";
import { SITE_URL } from "@/lib/site";
import { getPublicPageUrl } from "@/lib/slugs";

export const LINK_FARM_REASON = "link_farm_suspect";
const DEBOUNCE_MS = 24 * 60 * 60 * 1000;

/**
 * Host of a stored block URL, computed in SQL the same way extractLinkHosts()
 * does in JS: skip userinfo, lowercase, drop a trailing dot and a leading www.
 * Stored URLs are WHATWG-normalized by normalizeUrl(), so the scheme and host
 * are already lowercase; lower() is belt and braces.
 */
const hostExpr = sql<string>`regexp_replace(regexp_replace(lower((regexp_match(${blocks.url}, '^https?://(?:[^/?#@]*@)?([^/?#:]+)', 'i'))[1]), '\\.$', ''), '^www\\.', '')`;

export type LinkFarmCheckResult =
  | { flagged: false; reason: "missing" | "unpublished" | "no_hosts" | "below_threshold" | "debounced" }
  | { flagged: true; host: string; workspaces: number };

/**
 * Look for other workspaces' live pages linking to the same destination as
 * this page, and warn once a day per page when a host is widely shared.
 */
export async function runLinkFarmCheck(
  db: Db,
  pageId: string,
  deps: {
    sendAlert: (alert: { subject: string; html: string }) => Promise<void>;
    now?: Date;
  },
): Promise<LinkFarmCheckResult> {
  const now = deps.now ?? new Date();

  const [page] = await db
    .select({
      id: pages.id,
      slug: pages.slug,
      workspaceId: pages.workspaceId,
      isPublished: pages.isPublished,
    })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);
  if (!page) return { flagged: false, reason: "missing" };
  if (!page.isPublished) return { flagged: false, reason: "unpublished" };

  const own = await db
    .select({ url: blocks.url })
    .from(blocks)
    .where(
      and(
        eq(blocks.pageId, pageId),
        eq(blocks.type, "link"),
        eq(blocks.isVisible, true),
      ),
    );
  const hosts = extractLinkHosts(
    own.map((b) => b.url).filter((u): u is string => Boolean(u)),
  );
  if (hosts.length === 0) return { flagged: false, reason: "no_hosts" };

  const rows = await db
    .select({
      host: hostExpr,
      workspaces: sql<number>`count(distinct ${pages.workspaceId})`.mapWith(Number),
    })
    .from(blocks)
    .innerJoin(pages, eq(blocks.pageId, pages.id))
    .where(
      and(
        eq(pages.isPublished, true),
        ne(pages.workspaceId, page.workspaceId),
        eq(blocks.type, "link"),
        eq(blocks.isVisible, true),
        inArray(hostExpr, hosts),
      ),
    )
    .groupBy(hostExpr);

  const worst = worstSharedHost(
    Object.fromEntries(rows.map((r) => [r.host, r.workspaces])),
  );
  if (!worst) return { flagged: false, reason: "below_threshold" };

  const [recent] = await db
    .select({ id: pageModerationLog.id })
    .from(pageModerationLog)
    .where(
      and(
        eq(pageModerationLog.pageId, pageId),
        eq(pageModerationLog.action, "warning"),
        eq(pageModerationLog.reasonCode, LINK_FARM_REASON),
        gte(pageModerationLog.createdAt, new Date(now.getTime() - DEBOUNCE_MS)),
      ),
    )
    .limit(1);
  if (recent) return { flagged: false, reason: "debounced" };

  await db.insert(pageModerationLog).values({
    pageId,
    action: "warning",
    reasonCode: LINK_FARM_REASON,
    source: "publish_signal",
    details: `${worst.host} is linked from ${worst.workspaces} other workspaces' live pages`,
  });

  const url = `${SITE_URL}${getPublicPageUrl(page.slug)}`;
  await deps.sendAlert({
    subject: `Possible link farm: ${page.slug} → ${worst.host}`,
    html: `
      <p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a> links to
      <strong>${escapeHtml(worst.host)}</strong>, which ${worst.workspaces} other
      workspaces also link to from live pages.</p>
      <p>The page was not blocked. Review it and take it down if it is spam.</p>
    `,
  });

  return { flagged: true, ...worst };
}

/**
 * Run the check after the response is sent. It must never slow down or fail
 * the publish or edit that triggered it, so every error is caught here.
 */
export function scheduleLinkFarmCheck(pageId: string): void {
  after(async () => {
    try {
      await runLinkFarmCheck(appDb, pageId, { sendAlert: sendAdminAlert });
    } catch (error) {
      console.error("[link-farm] Check failed:", { pageId }, error);
      Sentry.captureException(error, {
        tags: { action: "linkFarmCheck" },
        extra: { pageId },
      });
    }
  });
}
