// src/lib/handoff.ts — counting one visit once across the in-app browser escape

import type { Redis } from "@upstash/redis";
import { redis } from "@/lib/redis";

/**
 * A visitor who escapes Instagram's webview loads the page twice: once in the
 * webview (the "source", which the server recognises from its User-Agent) and
 * once in Safari/Chrome (the "arrival", recognised only by the ln_h marker the
 * escape URL carries). Without pairing, one visit counts as two views.
 *
 * Pairing is ONE-DIRECTIONAL and conservative:
 *   1. The collector records the source $pageview and, only once PostHog has
 *      acknowledged it (src/lib/posthog-delivery.ts), registers a credit
 *      `available` for (slug, id).
 *   2. An arrival atomically flips that credit from `available` to `consumed`.
 *      Only that arrival is recorded as `page_handoff` instead of a view.
 *   3. `consumed` is retained until the key expires; registering the same id
 *      again never resets it, so one id collapses at most one arrival.
 *   4. Missing credit, expired credit, or any Redis uncertainty: the arrival
 *      counts as a normal view.
 *
 * Deliberate limitation: an arrival that reaches the collector before the
 * source has been recorded and registered is counted too (double count). The
 * error direction is always over-count; nothing is ever suppressed on the
 * strength of a counterpart that was not recorded. Both events carry
 * handoff_id, so the rate is measurable in PostHog.
 */

export const HANDOFF_TTL_SECONDS = 30 * 60;
const STORE_TIMEOUT_MS = 1000;

export interface HandoffStore {
  /** Create an `available` credit unless the key already exists. */
  register(key: string, ttlSeconds: number): Promise<void>;
  /** `available` → `consumed`, atomically. True exactly once per credit. */
  consume(key: string, ttlSeconds: number): Promise<boolean>;
}

export function handoffKey(slug: string, id: string): string {
  return `handoff:${slug}:${id}`;
}

// Compare-and-set in one round trip. A GET followed by a SET would let two
// concurrent arrivals both see `available`; a script runs atomically.
export const CONSUME_SCRIPT = `
if redis.call('GET', KEYS[1]) == 'available' then
  redis.call('SET', KEYS[1], 'consumed', 'EX', ARGV[1])
  return 1
end
return 0`;

export function upstashHandoffStore(client: Pick<Redis, "set" | "eval">): HandoffStore {
  return {
    async register(key, ttlSeconds) {
      // NX: an existing key — available or consumed — is left untouched.
      await client.set(key, "available", { nx: true, ex: ttlSeconds });
    },
    async consume(key, ttlSeconds) {
      const result = await client.eval(CONSUME_SCRIPT, [key], [String(ttlSeconds)]);
      return Number(result) === 1;
    },
  };
}

/** Same semantics as the Upstash store, in memory. For tests. */
export function memoryHandoffStore(now: () => number = Date.now): HandoffStore {
  const entries = new Map<string, { value: "available" | "consumed"; expiresAt: number }>();
  const live = (key: string) => {
    const entry = entries.get(key);
    if (entry && entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    async register(key, ttlSeconds) {
      if (!live(key)) entries.set(key, { value: "available", expiresAt: now() + ttlSeconds * 1000 });
    },
    async consume(key, ttlSeconds) {
      if (live(key)?.value !== "available") return false;
      entries.set(key, { value: "consumed", expiresAt: now() + ttlSeconds * 1000 });
      return true;
    },
  };
}

export const handoffStore: HandoffStore | null = redis ? upstashHandoffStore(redis) : null;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("handoff store timeout")), STORE_TIMEOUT_MS),
    ),
  ]);
}

/** Register a credit for a recorded source view. Never throws. */
export async function registerHandoff(
  store: HandoffStore | null,
  slug: string,
  id: string,
): Promise<void> {
  if (!store) return;
  try {
    await withTimeout(store.register(handoffKey(slug, id), HANDOFF_TTL_SECONDS));
  } catch (error) {
    console.error("[handoff] register failed; the arrival will count:", error);
  }
}

/** Whether this arrival spends a credit. False on any uncertainty. Never throws. */
export async function consumeHandoff(
  store: HandoffStore | null,
  slug: string,
  id: string,
): Promise<boolean> {
  if (!store) return false;
  try {
    return await withTimeout(store.consume(handoffKey(slug, id), HANDOFF_TTL_SECONDS));
  } catch (error) {
    console.error("[handoff] consume failed; counting the arrival:", error);
    return false;
  }
}
