"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { InferSelectModel } from "drizzle-orm";
import type { pages } from "@/lib/db/schema";
import * as Sentry from "@sentry/nextjs";
import { publishPage, unpublishPage } from "@/lib/actions/page";
import { getPublicPageUrl } from "@/lib/slugs";
import type { SaveCoordinator } from "./save-coordinator";
import { ShareModal } from "./share-modal";

type Page = InferSelectModel<typeof pages>;

interface PublishBarProps {
  page: Page;
  saves: SaveCoordinator;
  onPageChange: (updates: Partial<Page>) => void;
  onError: (message: string) => void;
}

export function PublishBar({ page, saves, onPageChange, onError }: PublishBarProps) {
  const router = useRouter();
  const [isPublishing, setIsPublishing] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const handlePublish = useCallback(async () => {
    const wasPublished = page.isPublished;
    setIsPublishing(true);
    try {
      // Nothing goes live over unsaved or rejected edits: send everything that
      // is still pending, retry anything that failed, and stop if any of it is
      // still refused.
      const flushed = await saves.flushAll();
      if (!flushed.ok) {
        onError("Fix the highlighted change before publishing.");
        return;
      }

      // NOTE: do not save the theme here. Theme edits are already persisted
      // incrementally by the theme editor, and this save used to pass the fully
      // *merged* theme (template defaults + user overrides) through the
      // free-tier colour gate — which rejected the built-in palettes of 4 of the
      // 6 free templates, making them impossible to publish. It also copied all
      // ~30 template tokens into pages.theme as "user overrides", which then
      // shadowed every future template switch.
      const result = await publishPage(page.id);
      if (result.error) {
        onError(result.error);
        return;
      }

      // Update client state so button switches to "Update"
      onPageChange({ isPublished: true, publishedAt: new Date() });

      // Confetti on first publish
      if (!wasPublished) {
        // Respect prefers-reduced-motion. The matchMedia guard also avoids
        // downloading the chunk at all; disableForReducedMotion alone would
        // still fetch it. The share modal is the actual payload here, so it
        // must open regardless of the motion preference.
        const prefersReducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;

        if (!prefersReducedMotion) {
          import("canvas-confetti").then((confetti) => {
            confetti.default({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 },
              disableForReducedMotion: true,
            });
          });
        }

        // Auto-open share modal on first publish
        setShowShare(true);
      }

      router.refresh();
    } catch (err) {
      // Surface something actionable and report it. This used to swallow the
      // real cause behind "Something went wrong", leaving nothing to debug
      // from — the server had no record at all that a publish had failed.
      console.error("Publish error:", err);
      Sentry.captureException(err, {
        tags: { action: "publishPage" },
        extra: { pageId: page.id, slug: page.slug },
      });
      onError(
        err instanceof Error && err.message
          ? `Couldn't publish: ${err.message}`
          : "Couldn't publish. Please try again — if it keeps happening, let us know.",
      );
    } finally {
      setIsPublishing(false);
    }
  }, [page.id, page.slug, page.isPublished, saves, router, onPageChange, onError]);

  const handleUnpublish = useCallback(async () => {
    const result = await unpublishPage(page.id);
    if (result.error) {
      onError(result.error);
      return;
    }
    onPageChange({ isPublished: false });
    router.refresh();
  }, [page.id, router, onPageChange, onError]);

  const blocked = saves.hasFailed();

  return (
    <>
      <div className="flex items-center gap-3">
        <a
          href={`/dashboard/preview/${page.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Preview
        </a>
        {page.isPublished && (
          <>
            <button
              onClick={() => setShowShare(true)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Share
            </button>
            <a
              href={getPublicPageUrl(page.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              View &rarr;
            </a>
            <button
              onClick={handleUnpublish}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-gray-50"
            >
              Unpublish
            </button>
          </>
        )}
        <button
          onClick={handlePublish}
          disabled={isPublishing || blocked}
          title={blocked ? "A change could not be saved. Fix it before publishing." : undefined}
          className="rounded-lg bg-black px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
        >
          {isPublishing
            ? "Publishing..."
            : page.isPublished
              ? "Update"
              : "Publish"}
        </button>
      </div>

      <ShareModal
        slug={page.slug}
        isOpen={showShare}
        onClose={() => setShowShare(false)}
      />
    </>
  );
}
