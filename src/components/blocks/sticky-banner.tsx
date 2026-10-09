"use client";

import { useState, useSyncExternalStore } from "react";
import type { PageBanner } from "@/lib/db/schema";
import { USER_LINK_REL, isExternalPage } from "@/lib/link-rel";
import { useBlockRuntime } from "./block-runtime";

/** Short stable key so a dismissal applies to this banner's content only. */
function bannerKey(pageId: string, banner: PageBanner): string {
  let hash = 5381;
  for (const ch of `${banner.text}\n${banner.url ?? ""}`) {
    hash = ((hash << 5) + hash + ch.charCodeAt(0)) | 0;
  }
  return `ln-banner:${pageId}:${(hash >>> 0).toString(36)}`;
}

function readDismissed(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false; // storage blocked: the banner simply stays
  }
}

const noopSubscribe = () => () => {};

/**
 * Announcement bar pinned to the top of the page. Dismissal lasts for the
 * browser tab (sessionStorage) and resets when the text or link changes; in
 * the editor preview it is never persisted.
 */
export function StickyBanner({
  banner,
  background,
  foreground,
}: {
  banner: PageBanner;
  background: string;
  foreground: string;
}) {
  const { mode, pageId } = useBlockRuntime();
  const key = bannerKey(pageId, banner);
  const stored = useSyncExternalStore(
    noopSubscribe,
    () => mode === "public" && readDismissed(key),
    () => false,
  );
  const [dismissedNow, setDismissedNow] = useState<string | null>(null);

  if (stored || dismissedNow === key) return null;

  const external = banner.url ? isExternalPage(banner.url) : false;

  return (
    <div
      role="region"
      aria-label="Announcement"
      className="sticky top-0 z-50 flex items-center justify-center gap-3 px-4 py-2 text-sm"
      style={{ backgroundColor: background, color: foreground }}
    >
      {banner.url ? (
        <a
          href={banner.url}
          {...(external ? { target: "_blank", rel: USER_LINK_REL } : {})}
          data-link-id="banner"
          data-link-label="Banner"
          className="rounded font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: foreground }}
        >
          {banner.text}
        </a>
      ) : (
        <span className="font-medium">{banner.text}</span>
      )}
      <button
        type="button"
        onClick={() => {
          setDismissedNow(key);
          if (mode === "public") {
            try {
              sessionStorage.setItem(key, "1");
            } catch {
              // storage blocked: dismissed for this view only
            }
          }
        }}
        aria-label="Dismiss announcement"
        className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-base leading-none opacity-80 hover:opacity-100 focus-visible:outline-2"
        style={{ outlineColor: foreground }}
      >
        ×
      </button>
    </div>
  );
}
