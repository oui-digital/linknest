import { parseBlockContent } from "@/lib/blocks/content";
import { platformName } from "@/lib/social-platforms";
import type { InAppApp } from "@/lib/in-app-browser";

/**
 * Pure helpers for the analytics report: date ranges, referrer cleanup, the
 * HogQL queries and the merge of PostHog rows with the page's blocks.
 *
 * Kept free of I/O so the parts that decide what an owner sees are testable.
 */

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export const TOP_LINKS_LIMIT = 25;
export const TOP_SOURCES_LIMIT = 10;

/** A requested range, if offered, capped by the plan; otherwise the plan's maximum. */
export function clampDays(requested: number | null | undefined, maxDays: number): number {
  if (requested && (ANALYTICS_RANGES as readonly number[]).includes(requested)) {
    return Math.min(requested, maxDays);
  }
  return maxDays;
}

// Link shims and short-link hosts that stand in for the platform itself.
const REFERRER_ALIASES: Record<string, string> = {
  "l.instagram.com": "instagram.com",
  "lm.instagram.com": "instagram.com",
  "t.co": "x.com",
  "twitter.com": "x.com",
  "l.facebook.com": "facebook.com",
  "lm.facebook.com": "facebook.com",
  "m.facebook.com": "facebook.com",
  "out.reddit.com": "reddit.com",
  "l.threads.net": "threads.net",
  "com.google.android.gm": "mail.google.com",
};

/**
 * Where an in-app view came from when the webview sent no referrer, which
 * Meta's webviews usually do not. Without this the traffic reads as Direct.
 */
export const IN_APP_REFERRER: Record<InAppApp, string> = {
  instagram: "instagram.com",
  facebook: "facebook.com",
  messenger: "messenger.com",
  threads: "threads.net",
};

const HOSTNAME_RE = /^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)*$/;

/**
 * The domain to report for a referrer hostname, or null if it is not a
 * hostname. Only ever a domain: paths and queries are never collected.
 */
export function canonicalReferrer(hostname: string): string | null {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (!HOSTNAME_RE.test(host)) return null;
  return REFERRER_ALIASES[host] ?? host;
}

/** UTC calendar days ending today, oldest first, as YYYY-MM-DD. */
export function dayKeys(days: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = days - 1; i >= 0; i--) {
    keys.push(new Date(today - i * 86_400_000).toISOString().slice(0, 10));
  }
  return keys;
}

/**
 * The reporting window: from 00:00 UTC on the first day shown to now. Every
 * query and the chart buckets use this one interval. A rolling
 * "now() - INTERVAL n DAY" boundary used to reach into an eighth, partial
 * calendar day that the chart dropped, so the summary disagreed with the
 * top-links table.
 */
export function analyticsWindow(days: number, now: Date = new Date()) {
  const keys = dayKeys(days, now);
  return {
    keys,
    start: `${keys[0]} 00:00:00`,
    end: now.toISOString().slice(0, 19).replace("T", " "),
  };
}

/** Short axis labels for day keys: weekdays up to two weeks, then "Oct 9". */
export function dayLabels(keys: string[]): string[] {
  return keys.map((key) =>
    new Date(`${key}T12:00:00Z`).toLocaleDateString(
      "en-US",
      keys.length > 14
        ? { month: "short", day: "numeric", timeZone: "UTC" }
        : { weekday: "short", timeZone: "UTC" },
    ),
  );
}

/** PostHog returns only days that have events; fill the gaps with zeros. */
export function denseSeries(byDay: Map<string, number>, keys: string[]): number[] {
  return keys.map((key) => byDay.get(key) ?? 0);
}

// ─── Queries ────────────────────────────────────────────────────────────────
// All parameterised ({…} values), never interpolated: the slug reaches these
// from a query string. Days are UTC (PostHog would otherwise bucket in the
// project's time zone) and bounded by analyticsWindow(). Explicit LIMITs because the query endpoint otherwise
// applies its own default.

export const DAILY_QUERY = `
  SELECT toDate(toTimeZone(timestamp, 'UTC')) AS day, count() AS c
  FROM events
  WHERE event = {event}
    AND properties.$current_url IN {urls}
    AND timestamp >= toDateTime({start}, 'UTC')
    AND timestamp <= toDateTime({end}, 'UTC')
  GROUP BY day
  ORDER BY day
  LIMIT 400`;

/**
 * Ranked by block, the identity the report shows. Grouping by URL here and
 * merging afterwards would let a link whose URL changed many times be split
 * across rows and cut off by the LIMIT before its total was known.
 */
export const TOP_BLOCKS_QUERY = `
  SELECT properties.block_id AS block_id,
         countIf(event = 'link_click') AS clicks,
         countIf(event = 'embed_play') AS plays,
         argMax(properties.label, timestamp) AS label
  FROM events
  WHERE event IN ('link_click', 'embed_play')
    AND properties.$current_url IN {urls}
    AND properties.block_id IS NOT NULL
    AND timestamp >= toDateTime({start}, 'UTC')
    AND timestamp <= toDateTime({end}, 'UTC')
  GROUP BY block_id
  ORDER BY clicks + plays DESC
  LIMIT ${TOP_LINKS_LIMIT}`;

/** Per-destination breakdown, only for the social-icon rows that ranked. */
export const SOCIAL_DESTINATIONS_QUERY = `
  SELECT properties.block_id AS block_id,
         properties.url AS url,
         argMax(properties.label, timestamp) AS label,
         count() AS clicks
  FROM events
  WHERE event = 'link_click'
    AND properties.$current_url IN {urls}
    AND properties.block_id IN {blockIds}
    AND timestamp >= toDateTime({start}, 'UTC')
    AND timestamp <= toDateTime({end}, 'UTC')
  GROUP BY block_id, url
  ORDER BY clicks DESC
  LIMIT 500`;

export const TOP_SOURCES_QUERY = `
  SELECT coalesce(properties.$referring_domain, '') AS source, count() AS views
  FROM events
  WHERE event = '$pageview'
    AND properties.$current_url IN {urls}
    AND timestamp >= toDateTime({start}, 'UTC')
    AND timestamp <= toDateTime({end}, 'UTC')
  GROUP BY source
  ORDER BY views DESC
  LIMIT ${TOP_SOURCES_LIMIT}`;

// ─── Merge with the page's blocks ───────────────────────────────────────────

export type BlockRow = { blockId: string; clicks: number; plays: number; label: string | null };
export type DestinationRow = { blockId: string; url: string; label: string | null; clicks: number };
export type PageBlock = {
  id: string;
  type: string;
  label: string | null;
  url: string | null;
  isVisible: boolean;
  content: unknown;
};

export type TopLinkStatus = "live" | "hidden" | "deleted" | "banner";
export type TopLink = {
  id: string;
  label: string;
  clicks: number;
  /** Embed play-button activations, counted apart from outbound clicks. */
  plays: number;
  status: TopLinkStatus;
  children?: { url: string; label: string; clicks: number }[];
};

function blockLabel(block: PageBlock, fallback: string | null): string {
  switch (block.type) {
    case "socials":
      return "Social icons";
    case "embed":
      return block.label || fallback || "Embed";
    default:
      return block.label || fallback || block.url || "Untitled link";
  }
}

/**
 * Combine ranked PostHog rows with the page's current blocks: current labels
 * win over the label recorded at click time, hidden and deleted blocks are
 * flagged, and social-icon rows are expanded per destination.
 */
export function mergeTopLinks(
  rows: BlockRow[],
  destinations: DestinationRow[],
  blocks: PageBlock[],
): TopLink[] {
  const byId = new Map(blocks.map((b) => [b.id, b]));

  const links = rows.map((row): TopLink => {
    if (row.blockId === "banner") {
      return { id: "banner", label: "Announcement banner", clicks: row.clicks, plays: row.plays, status: "banner" };
    }
    const block = byId.get(row.blockId);
    if (!block) {
      return {
        id: row.blockId,
        label: row.label || "Deleted block",
        clicks: row.clicks,
        plays: row.plays,
        status: "deleted",
      };
    }

    const link: TopLink = {
      id: row.blockId,
      label: blockLabel(block, row.label),
      clicks: row.clicks,
      plays: row.plays,
      status: block.isVisible ? "live" : "hidden",
    };

    if (block.type === "socials") {
      const names = new Map(
        (parseBlockContent("socials", block.content).items ?? []).map((item) => [
          item.url,
          item.label || platformName(item.platform),
        ]),
      );
      link.children = destinations
        .filter((d) => d.blockId === row.blockId)
        .map((d) => ({ url: d.url, label: names.get(d.url) ?? d.label ?? d.url, clicks: d.clicks }))
        .sort((a, b) => b.clicks - a.clicks);
    }
    return link;
  });

  return links
    .sort((a, b) => b.clicks + b.plays - (a.clicks + a.plays))
    .slice(0, TOP_LINKS_LIMIT);
}

/** Total link clicks ÷ page views. Can exceed 1: one visitor may click many links. */
export function clicksPerView(clicks: number, views: number): number | null {
  return views > 0 ? clicks / views : null;
}
