import { NextRequest, NextResponse } from "next/server";
import { PostHog } from "posthog-node";
import { z } from "zod";
import { checkRateLimit, mutationRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { normalizeSlug } from "@/lib/slugs";
import { SITE_URL } from "@/lib/site";

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
  event: z.enum(["$pageview", "link_click"]),
  slug: z.string().min(1).max(63),
  blockId: z.string().uuid().optional(),
  url: z.string().max(2048).optional(),
  label: z.string().max(255).optional(),
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

  const slug = normalizeSlug(parsed.data.slug);

  try {
    // captureImmediate() sends the event and awaits the HTTP request before
    // resolving. capture() + flush() did not: capture() enqueues on a later
    // microtask, so flush() found an empty queue and resolved at once, and the
    // request to PostHog was still in flight when this route returned and
    // Vercel suspended the function. Events then arrived minutes late, stamped
    // with the arrival time, or were lost when the instance was recycled.
    await posthog.captureImmediate({
      // Anonymous and per-event. The browser SDK used persistence:"memory",
      // which already produced a fresh id per page load, so this loses nothing
      // that was previously being measured.
      distinctId: crypto.randomUUID(),
      event: parsed.data.event,
      properties: {
        // Must match the exact-match filter in /api/analytics.
        $current_url: `${SITE_URL}/@${slug}`,
        slug,
        ...(parsed.data.blockId ? { block_id: parsed.data.blockId } : {}),
        ...(parsed.data.url ? { url: parsed.data.url } : {}),
        ...(parsed.data.label ? { label: parsed.data.label } : {}),
      },
    });
  } catch (error) {
    console.error("[collect] Failed to forward event:", error);
  }

  return new NextResponse(null, { status: 204 });
}
