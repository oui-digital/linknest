// src/lib/rate-limit.ts — Rate limiting via Upstash Redis + Ratelimit

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Only create Redis client if env vars are set (skip in development if not configured)
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

/**
 * Auth rate limiter: 5 requests per minute per identifier.
 * Callers key this by email (Server Actions) or client IP (the NextAuth
 * endpoints), so check the call site before assuming the scope.
 */
export const authRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 m"),
      prefix: "rl:auth",
    })
  : null;

/**
 * Email rate limiter: 3 emails per 5 minutes per address.
 * Prevents inbox flooding via magic links or verification emails.
 */
export const emailRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, "5 m"),
      prefix: "rl:email",
    })
  : null;

/**
 * Mutation rate limiter: 30 requests per minute per user.
 * Protects Server Actions (block CRUD, page updates, theme changes).
 */
export const mutationRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "1 m"),
      prefix: "rl:mutation",
    })
  : null;

/**
 * Report limiter: 3 reports per day per reporter abuse key (an IPv4 address or
 * an IPv6 /64, see src/lib/ip.ts). Atomic, unlike counting page_reports rows,
 * which two concurrent requests could both pass.
 */
export const reportRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, "1 d"),
      prefix: "rl:report",
    })
  : null;

/**
 * Alert throttle: at most one "page reported" email per page per day. A
 * takedown always alerts regardless.
 */
export const alertDedupeRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(1, "1 d"),
      prefix: "rl:alert",
    })
  : null;

// Missing rate-limit config used to silently disable every limiter with no
// signal at all — one absent env var removed a security control invisibly.
if (!redis && process.env.NODE_ENV === "production") {
  console.error(
    "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN are not set. " +
      "Rate limiting is DISABLED: auth brute-force, mail-bombing and mutation " +
      "flooding are all unthrottled.",
  );
}

/**
 * Check rate limit. Returns { success: true } if allowed, or { success: false } if blocked.
 *
 * When Redis is not configured (local dev), always allows. Transient Redis
 * errors also allow: an Upstash incident should not take down sign-in and the
 * editor, which is what an unguarded `await limiter.limit()` did — it threw
 * straight out of every calling Server Action.
 */
export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string,
): Promise<{ success: boolean; remaining?: number }> {
  if (!limiter) {
    return { success: true };
  }

  try {
    const result = await limiter.limit(identifier);
    return { success: result.success, remaining: result.remaining };
  } catch (error) {
    console.error("[rate-limit] Limiter unavailable, allowing request:", error);
    return { success: true };
  }
}
