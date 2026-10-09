"use client";

import { useState } from "react";
import { FaCalendarDays, FaPlay, FaSpotify, FaVimeoV, FaYoutube } from "react-icons/fa6";
import type { EmbedAspect, EmbedProvider } from "@/lib/embeds";
import { USER_LINK_REL } from "@/lib/link-rel";
import { useBlockRuntime } from "./block-runtime";

const ICONS = { youtube: FaYoutube, vimeo: FaVimeoV, spotify: FaSpotify, calendly: FaCalendarDays };

// Space is reserved before anything loads, so the page never shifts.
const BOX: Record<EmbedAspect, string> = {
  "16:9": "aspect-video w-full",
  "9:16": "mx-auto aspect-[9/16] w-full max-w-[280px]",
  compact: "h-[152px] w-full",
  square: "h-[352px] w-full",
  tall: "h-[700px] w-full",
};

/**
 * Click-to-load embed. Nothing from the provider loads until the visitor
 * presses play: no iframe, no script, no third-party image (the cover is a
 * copy stored by LinkNest). A plain link to the provider always sits below,
 * for visitors who prefer it or whose browser blocks frames.
 */
export function EmbedFacade({
  blockId,
  provider,
  providerName,
  title,
  canonicalUrl,
  coverUrl,
  aspect,
  autoplaySrc,
}: {
  blockId: string;
  provider: EmbedProvider;
  providerName: string;
  title: string;
  canonicalUrl: string;
  coverUrl: string | null;
  aspect: EmbedAspect;
  autoplaySrc: string;
}) {
  const { mode } = useBlockRuntime();
  const [playing, setPlaying] = useState(false);
  const Icon = ICONS[provider];
  const verb = provider === "calendly" ? "Open booking for" : "Play";

  return (
    <div className="flex w-full flex-col gap-2">
      <div
        className={`relative overflow-hidden ${BOX[aspect]}`}
        style={{ borderRadius: "var(--ln-border-radius)", backgroundColor: "var(--ln-color-surface)" }}
      >
        {playing ? (
          <iframe
            src={autoplaySrc}
            title={`${title} (${providerName})`}
            className="absolute inset-0 h-full w-full border-0"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            disabled={mode === "preview"}
            data-link-id={blockId}
            data-link-event="embed_play"
            data-link-label="Play"
            data-link-url={canonicalUrl}
            aria-label={`${verb} ${title} on ${providerName}`}
            className="group absolute inset-0 flex h-full w-full items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-[-4px] disabled:cursor-default"
            style={{ outlineColor: "var(--ln-color-text)" }}
          >
            {coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            )}
            <span className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent p-3 text-left text-sm font-medium text-white">
              <Icon aria-hidden className="shrink-0" size={18} />
              <span className="line-clamp-1">{title}</span>
            </span>
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-black/70 text-white transition-transform group-hover:scale-110 group-focus-visible:scale-110">
              {provider === "calendly" ? <FaCalendarDays aria-hidden size={20} /> : <FaPlay aria-hidden size={18} className="ml-1" />}
            </span>
          </button>
        )}
      </div>
      <a
        href={canonicalUrl}
        target="_blank"
        rel={USER_LINK_REL}
        data-link-id={blockId}
        data-link-label={`Open on ${providerName}`}
        className="self-center rounded text-xs underline underline-offset-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: "var(--ln-color-text-muted)", outlineColor: "var(--ln-color-text)" }}
      >
        Open on {providerName}
      </a>
    </div>
  );
}
