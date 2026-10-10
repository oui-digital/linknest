import { getPublicPageUrl } from "@/lib/slugs";

/**
 * Meta in-app browsers (Instagram, Facebook, Messenger, Threads): detection
 * and the "open this page in the real browser" escape links.
 *
 * Nothing here is guaranteed by any platform. Android intent URLs are a
 * documented Chrome mechanism, but whether Meta's webview hands them off is up
 * to Meta; instagram://extbrowser and x-safari-https are private schemes that
 * any app update can remove. Status as of October 2026 (source: the
 * shalanah/inapp-debugger harness and its issues):
 *   - Android intent://, tapped: works in Instagram, Facebook, Messenger.
 *   - instagram://extbrowser: verified on Instagram 445 (iOS 27, Android 16).
 *   - x-safari-https: dead in Instagram since v417; worked in Facebook,
 *     Messenger and Threads via window.open as of March 2026.
 * The bar therefore always degrades to instructions plus a Copy-link button.
 *
 * Pure and dependency-free: used by the public route on the server (detection
 * from the User-Agent header) and by the page beacon in the browser (reading
 * the handoff marker).
 */

export const IN_APP_APPS = ["instagram", "facebook", "messenger", "threads"] as const;
export type InAppApp = (typeof IN_APP_APPS)[number];
export type InAppPlatform = "ios" | "android";
export type InAppBrowser = { app: InAppApp; platform: InAppPlatform };

export const ESCAPE_METHODS = ["intent", "ig_extbrowser", "x_safari"] as const;
export type EscapeMethod = (typeof ESCAPE_METHODS)[number];

/**
 * One way out of the webview. `href`: the bar's anchor navigates to it, so the
 * navigation carries the visitor's tap (intent handling needs a user gesture).
 * `open`: preventDefault + window.open, falling back to location.href — the
 * only variant x-safari-https ever worked with in Meta's iOS webviews.
 */
export type EscapeAttempt = { method: EscapeMethod; url: string; via: "href" | "open" };

/** Everything the client bar needs, computed on the server. */
export type InAppEscape = InAppBrowser & {
  /** The page's own canonical URL, query and handoff marker included. */
  url: string;
  /** Ordered; empty when the platform's method is disabled (instructions only). */
  attempts: EscapeAttempt[];
  /** Attempt the escape on load (Android only, env-gated, off by default). */
  autoAttempt: boolean;
};

// Meta's link-preview crawlers: never an in-app visitor.
const CRAWLER_RE = /facebookexternalhit|facebookcatalog|Facebot/i;
const THREADS_RE = /\bBarcelona\b/;
const MESSENGER_RE = /MessengerForiOS|MessengerLiteForiOS|FB_IAB\/Orca-Android|FBAN\/Orca/;
const INSTAGRAM_RE = /\bInstagram\b/;
const FACEBOOK_RE = /FBAN\/|FB_IAB\/|FBAV\//;

/**
 * Which Meta in-app browser rendered the request, from its User-Agent.
 *
 * Null for crawlers, ordinary browsers, and a Meta app on a platform whose
 * menu we cannot describe (the Windows Facebook app). Precedence matters:
 * Messenger UAs also carry FBAV/, Threads UAs can mention Instagram.
 */
export function detectInAppBrowser(ua: string | null | undefined): InAppBrowser | null {
  if (!ua || CRAWLER_RE.test(ua)) return null;

  let app: InAppApp | null = null;
  if (THREADS_RE.test(ua)) app = "threads";
  else if (MESSENGER_RE.test(ua)) app = "messenger";
  else if (INSTAGRAM_RE.test(ua)) app = "instagram";
  else if (FACEBOOK_RE.test(ua)) app = "facebook";
  if (!app) return null;

  const platform: InAppPlatform | null = /iPhone|iPad|iPod/.test(ua)
    ? "ios"
    : /Android/.test(ua)
      ? "android"
      : null;
  return platform ? { app, platform } : null;
}

// ─── Handoff marker ─────────────────────────────────────────────────────────
// The escape URL carries ln_h=<app>-<id>. The id is issued per in-app render
// and pairs the webview's page view with the real browser's, so one visit is
// counted once (see src/lib/handoff.ts). The marker alone proves nothing.

export const HANDOFF_PARAM = "ln_h";
export const HANDOFF_ID_RE = /^[0-9a-f]{16}$/;
const HANDOFF_VALUE_RE = new RegExp(`^(${IN_APP_APPS.join("|")})-([0-9a-f]{16})$`);

export function newHandoffId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/** The handoff marker in a query string, if well-formed. */
export function readHandoff(search: string): { app: InAppApp; id: string } | null {
  const value = new URLSearchParams(search).get(HANDOFF_PARAM);
  const match = value ? HANDOFF_VALUE_RE.exec(value) : null;
  return match ? { app: match[1] as InAppApp, id: match[2]! } : null;
}

/** The URL without the handoff marker; every other parameter kept. */
export function stripHandoff(url: string): string {
  const u = new URL(url);
  if (!u.searchParams.has(HANDOFF_PARAM)) return url;
  u.searchParams.delete(HANDOFF_PARAM);
  return u.toString();
}

// ─── Escape URLs ────────────────────────────────────────────────────────────

/**
 * The absolute URL the real browser should open: the canonical page plus the
 * visitor's own query (utm_*, fbclid, igsh…) so campaign attribution survives
 * the hop. Every key is kept, repeated keys in order, values re-encoded; no
 * length cap beyond the platform's own URL limit. Never a fragment: an intent
 * URL cannot carry one.
 */
export function escapeTargetUrl(
  origin: string,
  slug: string,
  searchParams: Record<string, string | string[] | undefined> | undefined,
  app?: InAppApp,
  handoffId?: string,
): string {
  const url = new URL(getPublicPageUrl(slug), origin);
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (key === HANDOFF_PARAM || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) url.searchParams.append(key, v);
  }
  if (app && handoffId && HANDOFF_ID_RE.test(handoffId)) {
    url.searchParams.set(HANDOFF_PARAM, `${app}-${handoffId}`);
  }
  return url.toString();
}

/** Android: open `target` in the default browser. Query kept, fragment dropped. */
export function intentUrl(target: string): string {
  const u = new URL(target);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.slice(0, -1)};end`;
}

export function buildEscapeAttempts(
  target: string,
  info: InAppBrowser,
  disabled: ReadonlySet<EscapeMethod> = new Set(),
): EscapeAttempt[] {
  let attempts: EscapeAttempt[];
  if (info.platform === "android") {
    attempts = [{ method: "intent", url: intentUrl(target), via: "href" }];
  } else if (info.app === "instagram") {
    attempts = [
      {
        method: "ig_extbrowser",
        url: `instagram://extbrowser/?url=${encodeURIComponent(target)}`,
        via: "href",
      },
    ];
  } else {
    const u = new URL(target);
    attempts = [
      {
        method: "x_safari",
        url: `x-safari-${u.protocol}//${u.host}${u.pathname}${u.search}`,
        via: "open",
      },
    ];
  }
  return attempts.filter((a) => !disabled.has(a.method));
}

/** INAPP_ESCAPE_DISABLED: a comma list of methods, or "all". Unknown names are ignored. */
export function parseDisabledMethods(env: string | undefined): Set<EscapeMethod> | "all" {
  const names = (env ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (names.includes("all")) return "all";
  return new Set(names.filter((n): n is EscapeMethod => (ESCAPE_METHODS as readonly string[]).includes(n)));
}

export function planInAppEscape(
  info: InAppBrowser,
  target: string,
  opts: { disabled?: Set<EscapeMethod> | "all"; autoAttempt?: boolean } = {},
): InAppEscape | null {
  if (opts.disabled === "all") return null;
  const attempts = buildEscapeAttempts(target, info, opts.disabled);
  return {
    ...info,
    url: target,
    attempts,
    autoAttempt:
      Boolean(opts.autoAttempt) && info.platform === "android" && attempts[0]?.method === "intent",
  };
}

const LABELS: Record<InAppApp, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  messenger: "Messenger",
  threads: "Threads",
};

export function inAppLabel(app: InAppApp): string {
  return LABELS[app];
}

/**
 * How to leave the webview by hand. Instagram's wording is confirmed; the
 * Facebook, Messenger and Threads menus are kept generic until checked on
 * device.
 */
export function escapeInstructions({ app, platform }: InAppBrowser): string {
  if (app === "instagram") {
    return platform === "ios"
      ? "tap ••• in the top right, then “Open in external browser”."
      : "tap ⋮ in the top right, then “Open in external browser”.";
  }
  return platform === "ios"
    ? "tap ••• in the corner, then “Open in browser”."
    : "tap ⋮ in the corner, then “Open in browser”.";
}
