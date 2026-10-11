"use client";

import { useEffect, useRef } from "react";
import type { InferSelectModel } from "drizzle-orm";
import type { pages, blocks as blocksSchema } from "@/lib/db/schema";
import type { ThemeTokens } from "@/lib/templates/theme";
import { PublicPageView } from "@/components/templates/public-page-view";

type Page = InferSelectModel<typeof pages>;
type Block = InferSelectModel<typeof blocksSchema>;

interface LivePreviewProps {
  page: Page;
  blocks: Block[];
  theme: ThemeTokens;
  /** The block being edited: the frame scrolls it into view and flashes it. */
  activeBlockId?: string | null;
}

const HIGHLIGHT_MS = 1200;

/**
 * The editor's phone frame. Everything inside it is the same composition the
 * public page renders, in preview mode: interactive blocks are inert and the
 * badge is not a link.
 */
export function LivePreview({ page, blocks, theme, activeBlockId }: LivePreviewProps) {
  const phoneRef = useRef<HTMLDivElement>(null);

  // Scroll the frame itself, not scrollIntoView(): that also scrolls every
  // ancestor scroller, and the mobile overlay has one around the scaled phone
  // that must stay put.
  useEffect(() => {
    if (!activeBlockId) return;
    const frame = phoneRef.current?.firstElementChild as HTMLElement | null;
    if (!frame) return;
    // Matched by dataset rather than a selector: no escaping to get wrong.
    const target = [...frame.querySelectorAll<HTMLElement>("[data-block-id]")].find(
      (el) => el.dataset.blockId === activeBlockId,
    );
    if (!target) return;

    // One coordinate system. The mobile overlay scales the phone (0.85), so
    // getBoundingClientRect() distances are scaled while scrollTop,
    // clientHeight and offsetHeight are layout pixels; mixing them put low
    // blocks near the bottom of the frame instead of its centre. The frame's
    // own rect against its layout height gives the scale to divide out.
    const frameRect = frame.getBoundingClientRect();
    const scale = frame.clientHeight > 0 && frameRect.height > 0 ? frameRect.height / frame.clientHeight : 1;
    const distance = (target.getBoundingClientRect().top - frameRect.top) / scale;
    const top = distance + frame.scrollTop - (frame.clientHeight - target.offsetHeight) / 2;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    frame.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? "auto" : "smooth" });

    const previous = { outline: target.style.outline, outlineOffset: target.style.outlineOffset };
    const restore = () => {
      target.style.outline = previous.outline;
      target.style.outlineOffset = previous.outlineOffset;
    };
    target.style.outline = "2px solid currentColor";
    target.style.outlineOffset = "4px";
    const timer = setTimeout(restore, HIGHLIGHT_MS);
    // Switching blocks before the timer fires used to leave the first outline
    // on for good: the cleanup cancelled the timer and nothing else.
    return () => {
      clearTimeout(timer);
      restore();
    };
  }, [activeBlockId]);

  return (
    <div className="relative">
      <div
        ref={phoneRef}
        className="h-[700px] w-[375px] overflow-hidden rounded-[2.5rem] border-[8px] border-gray-800 bg-white shadow-xl"
      >
        <PublicPageView
          page={page}
          blocks={blocks}
          theme={theme}
          mode="preview"
          // hideBranding can only be saved on Pro (updateTheme gates it).
          showBadge={!theme.hideBranding}
          showReport={false}
          frameClassName="h-full overflow-y-auto"
        />
      </div>
    </div>
  );
}
