/**
 * Link-farm signal: many unrelated accounts pointing at the same destination.
 *
 * SEO spam rings create one page per throwaway account, all linking to the
 * same casino / pharma / "buy followers" domain. Any single page looks
 * innocuous; the pattern shows up only across workspaces. This never blocks a
 * publish — it logs a warning and emails the admin, who decides.
 */

/** Distinct other workspaces linking to one host before it is flagged. */
export const LINK_FARM_MIN_WORKSPACES = 5;

/** Most hosts considered per page, so one page cannot make the query huge. */
export const LINK_FARM_MAX_HOSTS = 20;

/**
 * Destinations that legitimate pages share by the thousand. Without this,
 * every page with an Instagram link would "share" a host with every other.
 */
export const COMMON_LINK_HOSTS: ReadonlySet<string> = new Set([
  "instagram.com",
  "youtube.com",
  "youtu.be",
  "m.youtube.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "m.facebook.com",
  "fb.me",
  "linkedin.com",
  "threads.net",
  "snapchat.com",
  "pinterest.com",
  "spotify.com",
  "open.spotify.com",
  "music.apple.com",
  "podcasts.apple.com",
  "apps.apple.com",
  "apple.com",
  "play.google.com",
  "github.com",
  "twitch.tv",
  "discord.gg",
  "discord.com",
  "t.me",
  "wa.me",
  "api.whatsapp.com",
  "amazon.com",
  "etsy.com",
  "patreon.com",
  "ko-fi.com",
  "buymeacoffee.com",
  "medium.com",
  "substack.com",
  "calendly.com",
  "linktr.ee",
  "soundcloud.com",
  "bandcamp.com",
  "vimeo.com",
  "reddit.com",
  "google.com",
  "maps.google.com",
  "goo.gl",
  "docs.google.com",
  "forms.gle",
  "paypal.me",
  "venmo.com",
  "cash.app",
]);

/** Lowercase, strip a leading "www." and a trailing dot. */
export function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

/**
 * The distinct, non-common web hosts a page links to. URL parsing (not a
 * regex) so userinfo tricks like https://x@casino.example resolve to the real
 * host.
 */
export function extractLinkHosts(urls: readonly string[]): string[] {
  const hosts = new Set<string>();
  for (const raw of urls) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    const host = normalizeHost(parsed.hostname);
    // IPv6 literals are skipped: the SQL host expression cannot match them the
    // same way, and farms use domains anyway.
    if (!host || host.startsWith("[") || COMMON_LINK_HOSTS.has(host)) continue;
    hosts.add(host);
    if (hosts.size >= LINK_FARM_MAX_HOSTS) break;
  }
  return [...hosts];
}

/**
 * The single host shared with the most other workspaces, if it meets the
 * threshold. Counts are per host on purpose: a page linking to five hosts that
 * each appear once elsewhere is not a link farm.
 */
export function worstSharedHost(
  counts: Readonly<Record<string, number>>,
  threshold: number = LINK_FARM_MIN_WORKSPACES,
): { host: string; workspaces: number } | null {
  let worst: { host: string; workspaces: number } | null = null;
  for (const [host, workspaces] of Object.entries(counts)) {
    if (workspaces < threshold) continue;
    if (!worst || workspaces > worst.workspaces) worst = { host, workspaces };
  }
  return worst;
}
