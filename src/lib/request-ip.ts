import { headers } from "next/headers";

/**
 * Best-effort client IP, used for rate limiting and abuse keys
 * (abuseKeyForIp in src/lib/ip.ts).
 *
 * On Vercel the platform sets x-vercel-forwarded-for on every request, so only
 * the first branch is reached in production; x-real-ip and x-forwarded-for
 * are fallbacks for local development and other hosts.
 *
 * Prefers headers the hosting platform sets itself. Falls back to the LAST
 * `x-forwarded-for` entry rather than the first: every earlier entry is
 * attacker-supplied and can be forged to defeat a per-IP limit, while the final
 * hop is appended by our own proxy.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();

  const vercel = h.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]!.trim();

  const real = h.get("x-real-ip");
  if (real) return real.trim();

  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1]!;
  }

  return "unknown";
}
