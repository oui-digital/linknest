"use client";

import { useEffect } from "react";

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

export function PageBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    const send = (payload: Record<string, unknown>) => {
      const body = JSON.stringify({ slug, ...payload });

      // sendBeacon survives the page unloading, which a plain fetch does not —
      // it is the difference between counting a click and losing it when the
      // browser navigates away.
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/collect",
          new Blob([body], { type: "application/json" }),
        );
        return;
      }
      fetch("/api/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    };

    send({ event: "$pageview" });

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
  }, [slug]);

  return null;
}
