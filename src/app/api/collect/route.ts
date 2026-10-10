import { NextRequest, NextResponse } from "next/server";
import { PostHog } from "posthog-node";
import { z } from "zod";
import { checkRateLimit, mutationRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { normalizeSlug } from "@/lib/slugs";
import { SITE_URL } from "@/lib/site";
import { IN_APP_REFERRER, canonicalReferrer } from "@/lib/analytics";
import { ESCAPE_METHODS, HANDOFF_ID_RE, IN_APP_APPS } from "@/lib/in-app-browser";
import { consumeHandoff, handoffStore, registerHandoff } from "@/lib/handoff";
import { sendWithAck, trackedFetch } from "@/lib/posthog-delivery";

/**
 * First-party analytics ingest for public pages.
 *
 * Replaces posthog-js on the public route, which cost ~50 KB brotli of client
 * JavaScript — most of it session replay, surveys, autocapture and the toolbar,
 * none of which this product uses. Events now arrive from a ~1 KB beacon and are
 * forwarded server-side.
 *
 * Two side benefits over the browser SDK: requests go to our own origin, so the
 * ad blockers that block *.posthog.com no longer silently erase a chunk of every
 * creator's traffic; and no third-party script observes visitors at all.
 */

const eventSchema = z.object({
  event: z.enum(["$pageview", "link_click", "embed_play", "inapp_escape"]),
  slug: z.string().min(1).max(63),
  // A block id, or "banner" for the page-level announcement link.
  blockId: z.union([z.uuid(), z.literal("banner")]).optional(),
  url: z.string().max(2048).optional(),
  label: z.string().max(255).optional(),
  // Hostname of document.referrer, page views only. Never a path or query.
  referrer: z.string().max(253).optional(),

  // In-app browsers (src/lib/in-app-browser.ts). The app key only, never the
  // User-Agent. `inApp`: the server saw a Meta webview render this page (page
  // views) or the visitor used the Open-in-browser bar (inapp_escape).
  // `handoff`: this load arrived in the real browser through an escape.
  inApp: z.enum(IN_APP_APPS).optional(),
  handoff: z.enum(IN_APP_APPS).optional(),
  // Loose on purpose: a malformed id downgrades to a plain counted view
  // instead of dropping the view.
  handoffId: z.string().max(64).optional(),
  platform: z.enum(["ios", "android"]).optional(),
  method: z.enum(ESCAPE_METHODS).optional(),
  outcome: z.enum(["attempt", "instructions_shown", "copied"]).optional(),
});

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      // The route now waits for PostHog before responding, so bound that wait.
      // SDK defaults (3 retries, 3 s apart, 10 s timeout each) could hold a
      // function for ~50 s during a PostHog incident. Two attempts of at most
      // 3 s each keeps the worst case under 7 s; the visitor never waits, as
      // the beacon is fire-and-forget.
      fetchRetryCount: 1,
      fetchRetryDelay: 500,
      requestTimeout: 3000,
      // Client-level, per the Node SDK: there is no per-event geo property.
      // The privacy policy states visitor IPs are not logged, and no feature
      // depends on geo.
      disableGeoip: true,
      // Lets sendWithAck() learn whether PostHog accepted an event, which
      // captureImmediate() does not report (src/lib/posthog-delivery.ts).
      fetch: trackedFetch,
    });
  }
  return client;
}

// Cheap, deliberately conservative bot filter. The browser SDK used to do this
// for us; without it, crawler traffic would inflate every creator's view count.
const BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|showyoubot|outbrain|pinterest|vkshare|w3c_validator|whatsapp|telegram|discord|slack|preview|headless|lighthouse|gtmetrix|pingdom/i;

export async function POST(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") ?? "";
  if (!userAgent || BOT_RE.test(userAgent)) {
    // 204 rather than an error: bots should not retry, and a visitor should
    // never see analytics fail.
    return new NextResponse(null, { status: 204 });
  }

  // Public, unauthenticated endpoint — throttle per IP. The IP is used for this
  // check only and is never stored, matching the privacy policy.
  const ip = await getClientIp();
  const rl = await checkRateLimit(mutationRateLimit, `collect:${ip}`);
  if (!rl.success) {
    return new NextResponse(null, { status: 204 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return new NextResponse(null, { status: 204 });
  }

  const posthog = getClient();
  if (!posthog) return new NextResponse(null, { status: 204 });

  const data = parsed.data;
  const slug = normalizeSlug(data.slug);
  const isPageview = data.event === "$pageview";

  // In-app roles, page views only. A source is the webview's view (the server
  // recognised the app); an arrival is the real browser's view after an
  // escape. Pairing needs a well-formed id; without one both are plain views.
  const inApp = isPageview || data.event === "inapp_escape" ? data.inApp : undefined;
  const handoff = isPageview && !data.inApp ? data.handoff : undefined;
  const handoffId =
    isPageview && (inApp || handoff) && data.handoffId && HANDOFF_ID_RE.test(data.handoffId)
      ? data.handoffId
      : undefined;

  // Malformed referrers are dropped, not rejected: the view still counts.
  // Meta's webviews usually send none, so an in-app view falls back to the app.
  const referringDomain = isPageview
    ? (data.referrer ? canonicalReferrer(data.referrer) : null) ??
      (inApp ?? handoff ? IN_APP_REFERRER[(inApp ?? handoff)!] : null)
    : null;

  // An arrival that spends its source's credit is the same visit continuing in
  // the real browser: recorded as page_handoff, which no report counts as a
  // view. Decided BEFORE capture; any uncertainty counts it (src/lib/handoff.ts).
  const continued =
    handoff && handoffId ? await consumeHandoff(handoffStore, slug, handoffId) : false;

  const message = {
    // Anonymous and per-event. The browser SDK used persistence:"memory",
    // which already produced a fresh id per page load, so this loses nothing
    // that was previously being measured.
    distinctId: crypto.randomUUID(),
    event: continued ? "page_handoff" : data.event,
    properties: {
      // Must match the exact-match filter in /api/analytics.
      $current_url: `${SITE_URL}/@${slug}`,
      slug,
      ...(data.blockId ? { block_id: data.blockId } : {}),
      ...(data.url ? { url: data.url } : {}),
      ...(data.label ? { label: data.label } : {}),
      ...(referringDomain ? { $referring_domain: referringDomain } : {}),
      ...(inApp ? { in_app: inApp } : {}),
      ...(handoff ? { in_app_handoff: handoff } : {}),
      ...(handoffId ? { handoff_id: handoffId } : {}),
      ...(data.event === "inapp_escape"
        ? {
            ...(data.platform ? { in_app_platform: data.platform } : {}),
            ...(data.method ? { escape_method: data.method } : {}),
            ...(data.outcome ? { escape_outcome: data.outcome } : {}),
          }
        : {}),
    },
  };

  try {
    if (inApp && isPageview && handoffId) {
      // A source view earns its credit only once PostHog has acknowledged it:
      // captureImmediate() resolves even when delivery failed, and a credit for
      // an unrecorded view would let the arrival be dropped too — zero views.
      if (await sendWithAck(posthog, message)) {
        await registerHandoff(handoffStore, slug, handoffId);
      }
    } else {
      // captureImmediate() sends the event and awaits the HTTP request before
      // resolving. capture() + flush() did not: capture() enqueues on a later
      // microtask, so flush() found an empty queue and resolved at once, and
      // the request to PostHog was still in flight when this route returned and
      // Vercel suspended the function. Events then arrived minutes late,
      // stamped with the arrival time, or were lost when the instance was
      // recycled.
      await posthog.captureImmediate(message);
    }
  } catch (error) {
    console.error("[collect] Failed to forward event:", error);
  }

  return new NextResponse(null, { status: 204 });
}
