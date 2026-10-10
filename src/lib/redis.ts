// src/lib/redis.ts — the one Upstash Redis client (rate limiting, handoff credits)

import { Redis } from "@upstash/redis";

/**
 * Null when UPSTASH_REDIS_REST_URL/TOKEN are unset (local development). Every
 * caller treats null as "unavailable" and degrades: rate limiters allow, the
 * handoff store counts every view.
 */
export const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;
