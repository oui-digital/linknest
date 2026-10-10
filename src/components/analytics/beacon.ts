/**
 * The public page's analytics transport, shared by PageBeacon and the
 * Open-in-browser bar so neither carries its own copy.
 */
export function sendBeacon(body: Record<string, unknown>): void {
  const json = JSON.stringify(body);

  // sendBeacon survives the page unloading, which a plain fetch does not —
  // it is the difference between counting a click and losing it when the
  // browser navigates away.
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/collect", new Blob([json], { type: "application/json" }));
    return;
  }
  fetch("/api/collect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: json,
    keepalive: true,
  }).catch(() => {});
}

/**
 * Resolves once PageBeacon has handed this load's $pageview to the transport.
 * The Open-in-browser bar's automatic Android escape waits on it (capped), so
 * the webview's view is queued before the page navigates away. It only orders
 * the queueing; counting correctness never depends on it (src/lib/handoff.ts).
 */
let resolvePageviewQueued!: () => void;
export const pageviewQueued = new Promise<void>((resolve) => {
  resolvePageviewQueued = resolve;
});
export function markPageviewQueued(): void {
  resolvePageviewQueued();
}
