"use client";

import { useEffect } from "react";
import type { InAppApp } from "@/lib/in-app-browser";
import { readHandoff, stripHandoff } from "@/lib/in-app-browser";
import { markPageviewQueued, sendBeacon } from "./beacon";

/**
 * Public-page analytics beacon.
 *
 * Replaces posthog-js (~50 KB brotli) with a delegated activation listener and
 * two fetch calls. Posts to our own origin, so ad blockers that block
 * *.posthog.com no longer erase traffic, and no third-party script runs on
 * visitor pages.
 *
 * Anything carrying `data-link-id` is tracked: link anchors, social icons, the
 * announcement banner's link, embed play buttons. Optional attributes refine
 * the event: `data-link-label` (preferred over the element's text, which is
 * empty for icon-only anchors and includes the description on a card),
 * `data-link-url` (for elements that are not anchors) and `data-link-event`
 * (`embed_play`; everything else is a `link_click`).
 *
 * In-app browsers (see src/lib/in-app-browser.ts): `inApp` is set by the
 * server when it recognised a Meta webview, and `handoffId` when that webview
 * was offered an escape. A load in the real browser after an escape carries
 * the `ln_h` marker instead; the collector uses the two to count the visit
 * once (src/lib/handoff.ts). The marker is removed from the address bar so a
 * visitor sharing the URL does not pass it on.
 */
/**
 * Whether a click event is a real activation. A middle click only opens
 * links: on a button (an embed's play button) it does nothing, so it must not
 * count as a play.
 */
export function isTrackableActivation({
  type,
  button,
  isAnchor,
}: {
  type: string;
  button: number;
  isAnchor: boolean;
}): boolean {
  if (type === "click") return true;
  return type === "auxclick" && button === 1 && isAnchor;
}

export function PageBeacon({
  slug,
  inApp,
  handoffId,
}: {
  slug: string;
  inApp?: InAppApp;
  handoffId?: string;
}) {
  useEffect(() => {
    const send = (payload: Record<string, unknown>) => sendBeacon({ slug, ...payload });

    // Only the referring site's hostname, and only when it is another site:
    // the full address can carry personal data in its path or query.
    let referrer: string | undefined;
    try {
      const host = new URL(document.referrer).hostname;
      if (host && host !== location.hostname) referrer = host;
    } catch {
      // No referrer (typed address, app, privacy setting): leave it unset.
    }
    // A marker means "arrived from an escape" only outside the webview: a
    // marked link reopened inside Instagram is a fresh in-app visit.
    const handoff = inApp ? null : readHandoff(location.search);
    try {
      const clean = stripHandoff(location.href);
      if (clean !== location.href) history.replaceState(history.state, "", clean);
    } catch {
      // Malformed URL or a locked-down history API: keep the marker.
    }

    send({
      event: "$pageview",
      referrer,
      ...(inApp ? { inApp, handoffId } : {}),
      ...(handoff ? { handoff: handoff.app, handoffId: handoff.id } : {}),
    });
    markPageviewQueued();

    // `click` fires for left-clicks, modifier-clicks (which open a new tab) and
    // keyboard activation; `auxclick` with button 1 is the middle click. A
    // right-click only reaches `auxclick` (button 2) and is ignored: opening
    // the context menu is not a visit. The previous `pointerdown` listener
    // counted right-clicks and missed Enter on a focused link entirely.
    const onActivate = (event: MouseEvent) => {
      const el = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-link-id]",
      );
      if (!el) return;
      if (
        !isTrackableActivation({
          type: event.type,
          button: event.button,
          isAnchor: el instanceof HTMLAnchorElement,
        })
      ) {
        return;
      }

      const label = (el.dataset.linkLabel ?? el.textContent ?? "")
        .trim()
        .slice(0, 255);
      send({
        event: el.dataset.linkEvent === "embed_play" ? "embed_play" : "link_click",
        blockId: el.dataset.linkId,
        url: el instanceof HTMLAnchorElement ? el.href : el.dataset.linkUrl,
        label: label || undefined,
      });
    };

    document.addEventListener("click", onActivate);
    document.addEventListener("auxclick", onActivate);
    return () => {
      document.removeEventListener("click", onActivate);
      document.removeEventListener("auxclick", onActivate);
    };
  }, [slug, inApp, handoffId]);

  return null;
}
