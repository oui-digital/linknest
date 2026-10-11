import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { blocks } from "@/lib/db/schema";
import { getUserWorkspace, getWorkspacePages } from "@/lib/queries";
import { getLimit, type PlanId } from "@/lib/entitlements";
import { normalizeSlug } from "@/lib/slugs";
import { SITE_URL } from "@/lib/site";
import {
  BLOCK_COUNTS_QUERY,
  DAILY_QUERY,
  SOCIAL_DESTINATIONS_QUERY,
  TOP_BLOCKS_QUERY,
  TOP_SOURCES_QUERY,
  analyticsWindow,
  clampDays,
  clicksPerView,
  dayLabels,
  denseSeries,
  mergeTopLinks,
  blockCounts,
  type BlockCounts,
  type BlockRow,
  type DestinationRow,
  type TopLink,
} from "@/lib/analytics";

/**
 * GET /api/analytics?slug=<page-slug>&days=7|30|90&view=summary|full|blocks
 *
 * Views and link clicks for one page from PostHog. `days` is capped by the
 * plan (7 days free, 90 days Pro). `view=full` adds the top links and top
 * referring domains; the dashboard cards ask for the summary only.
 * `view=blocks` returns clicks and plays for every current block of the page
 * (BlockCountsResponse), for the editor's per-block chips.
 */
export type BlockCountsResponse = {
  days: number;
  maxDays: number;
  configured: boolean;
  blocks: BlockCounts;
  error?: string;
};
export type AnalyticsResponse = {
  days: number;
  maxDays: number;
  configured: boolean;
  labels: string[];
  views: { total: number | null; daily: number[] };
  clicks: { total: number | null; daily: number[] };
  /** Total link clicks ÷ views. Can exceed 1. Null without views. */
  clicksPerView: number | null;
  topLinks?: TopLink[];
  topSources?: { source: string; views: number }[];
  error?: string;
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await getUserWorkspace(session.user.id);
  if (!workspace) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const params = request.nextUrl.searchParams;
  const rawSlug = params.get("slug");
  if (!rawSlug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }
  const slug = normalizeSlug(rawSlug);

  // Verify the page belongs to this workspace
  const pages = await getWorkspacePages(workspace.id);
  const page = pages.find((p) => p.slug === slug);
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const maxDays = getLimit(workspace.plan as PlanId, "analytics_days");
  const days = clampDays(Number(params.get("days")) || null, maxDays);
  const view = params.get("view");
  const full = view === "full";
  const window = analyticsWindow(days);
  const keys = window.keys;
  const labels = dayLabels(keys);
  const base = { days, maxDays, labels };

  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  // If PostHog is not configured, return placeholder data. This is an operator
  // misconfiguration, not something the account owner can fix, so log it loudly
  // — otherwise every customer silently sees an empty dashboard.
  if (!apiKey || !projectId) {
    console.error(
      "[analytics] POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID are not set — " +
        "analytics is returning empty data for every user.",
    );
    if (view === "blocks") {
      return jsonCounts({ days, maxDays, configured: false, blocks: {} });
    }
    const zeros = Array(days).fill(0);
    return json({
      ...base,
      configured: false,
      views: { total: 0, daily: zeros },
      clicks: { total: 0, daily: zeros },
      clicksPerView: null,
      ...(full ? { topLinks: [], topSources: [] } : {}),
    });
  }

  // Match the page's canonical URL exactly. "icontains /@<slug>" credited every
  // view of @jordan and @jones to @jo, because a slug may be a prefix of
  // another slug — so short-handle owners saw inflated counts and long-handle
  // owners had their traffic double-counted into someone else's dashboard.
  const canonicalUrl = `${SITE_URL}/@${slug}`;
  const urls = [canonicalUrl, `${canonicalUrl}/`];

  // HogQL via /query/. The previous implementation posted to
  // /api/projects/:id/insights/trend/, which PostHog has retired.
  async function hogql<Row extends unknown[]>(
    query: string,
    values: Record<string, unknown>,
  ): Promise<Row[]> {
    const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query,
          values: { urls, start: window.start, end: window.end, ...values },
        },
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`PostHog query failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { results?: Row[] };
    return body.results ?? [];
  }

  if (view === "blocks") {
    const ids = (
      await db.select({ id: blocks.id }).from(blocks).where(eq(blocks.pageId, page.id))
    ).map((b) => b.id);
    try {
      const rows = ids.length
        ? (await hogql<[string, number, number]>(BLOCK_COUNTS_QUERY, { blockIds: ids })).map(
            ([blockId, clicks, plays]) => ({
              blockId: String(blockId),
              clicks: Number(clicks),
              plays: Number(plays),
            }),
          )
        : [];
      return jsonCounts({ days, maxDays, configured: true, blocks: blockCounts(rows, ids) });
    } catch (error) {
      console.error("[analytics] PostHog block counts failed:", error);
      return jsonCounts(
        { days, maxDays, configured: true, blocks: {}, error: "Analytics are temporarily unavailable." },
        502,
      );
    }
  }

  const daily = async (event: string) =>
    new Map(
      (await hogql<[string, number]>(DAILY_QUERY, { event })).map(([day, c]) => [
        String(day).slice(0, 10),
        Number(c),
      ]),
    );

  try {
    const [viewsByDay, clicksByDay, ranked, sources] = await Promise.all([
      daily("$pageview"),
      daily("link_click"),
      full ? hogql<[string, number, number, string | null]>(TOP_BLOCKS_QUERY, {}) : null,
      full ? hogql<[string, number]>(TOP_SOURCES_QUERY, {}) : null,
    ]);

    const viewsDaily = denseSeries(viewsByDay, keys);
    const clicksDaily = denseSeries(clicksByDay, keys);
    const viewsTotal = viewsDaily.reduce((sum, n) => sum + n, 0);
    const clicksTotal = clicksDaily.reduce((sum, n) => sum + n, 0);

    const response: AnalyticsResponse = {
      ...base,
      configured: true,
      views: { total: viewsTotal, daily: viewsDaily },
      clicks: { total: clicksTotal, daily: clicksDaily },
      clicksPerView: clicksPerView(clicksTotal, viewsTotal),
    };

    if (ranked && sources) {
      const rows: BlockRow[] = ranked.map(([blockId, clicks, plays, label]) => ({
        blockId: String(blockId),
        clicks: Number(clicks),
        plays: Number(plays),
        label: label ? String(label) : null,
      }));

      const pageBlocks = await db
        .select({
          id: blocks.id,
          type: blocks.type,
          label: blocks.label,
          url: blocks.url,
          isVisible: blocks.isVisible,
          content: blocks.content,
        })
        .from(blocks)
        .where(eq(blocks.pageId, page.id));

      const socialIds = rows
        .map((r) => r.blockId)
        .filter((id) => pageBlocks.some((b) => b.id === id && b.type === "socials"));

      const destinations: DestinationRow[] =
        socialIds.length > 0
          ? (
              await hogql<[string, string, string | null, number]>(SOCIAL_DESTINATIONS_QUERY, {
                blockIds: socialIds,
              })
            ).map(([blockId, url, label, clicks]) => ({
              blockId: String(blockId),
              url: String(url),
              label: label ? String(label) : null,
              clicks: Number(clicks),
            }))
          : [];

      response.topLinks = mergeTopLinks(rows, destinations, pageBlocks);
      response.topSources = sources.map(([source, views]) => ({
        source: String(source ?? ""),
        views: Number(views),
      }));
    }

    return json(response);
  } catch (error) {
    console.error("[analytics] PostHog query failed:", error);
    // 502 rather than a 200 full of zeros: an outage used to be indistinguishable
    // from "nobody visited your page", which is worse than showing an error.
    return json(
      {
        ...base,
        configured: true,
        views: { total: null, daily: [] },
        clicks: { total: null, daily: [] },
        clicksPerView: null,
        error: "Analytics are temporarily unavailable.",
      },
      502,
    );
  }
}

function jsonCounts(body: BlockCountsResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, max-age=60" },
  });
}

function json(body: AnalyticsResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
