// src/lib/posthog-delivery.ts — knowing whether PostHog actually took an event

import { AsyncLocalStorage } from "node:async_hooks";
import type { EventMessage, PostHog, PostHogOptions } from "posthog-node";

/**
 * posthog-node's captureImmediate() resolves even when delivery failed: the
 * core's sendImmediate() catches the transport error and only emits it on a
 * client-wide 'error' event (posthog-node 5.24.14 / @posthog/core 1.21.0,
 * posthog-core-stateless.ts sendImmediate), and captureImmediate adds a
 * second catch. A client-wide event cannot be tied to one request when an
 * instance serves concurrent requests, so it cannot gate anything.
 *
 * What the SDK does guarantee: the immediate path sends through the `fetch`
 * passed to the constructor, within the async context of the captureImmediate
 * call, and treats status < 200 or >= 400 as a failure (retrying per
 * fetchRetryCount). trackedFetch observes that response and marks the calling
 * request's acknowledgement, scoped with AsyncLocalStorage.
 *
 * Only the handoff credit depends on this (src/lib/handoff.ts): a credit must
 * exist only for a source view PostHog accepted. If a future SDK breaks the
 * context propagation, posthog-delivery.test.ts fails rather than credits
 * being created silently; the fallback is to POST the event to /batch/ with a
 * direct fetch and read the status.
 */

type FetchLike = NonNullable<PostHogOptions["fetch"]>;

const delivery = new AsyncLocalStorage<{ delivered: boolean }>();

/** Create a fetch for the PostHog client that reports successful /batch/ requests. */
export function createTrackedFetch(base: FetchLike = (url, init) => fetch(url, init as RequestInit)): FetchLike {
  return async (url, init) => {
    const res = await base(url, init); // a network error still throws, as before
    const ack = delivery.getStore();
    if (ack && isBatchUrl(url) && res.status >= 200 && res.status < 400) ack.delivered = true;
    return res; // the SDK still sees the real response and retries on its own
  };
}

function isBatchUrl(url: string): boolean {
  try {
    return new URL(url).pathname.endsWith("/batch/");
  } catch {
    return false;
  }
}

export const trackedFetch = createTrackedFetch();

/**
 * captureImmediate, plus whether PostHog acknowledged the event. False on any
 * failure, timeout or uncertainty. The client must have been constructed with
 * a fetch from createTrackedFetch(). Never throws.
 */
export async function sendWithAck(client: PostHog, message: EventMessage): Promise<boolean> {
  const ack = { delivered: false };
  try {
    await delivery.run(ack, () => client.captureImmediate(message));
  } catch {
    return false;
  }
  return ack.delivered;
}
