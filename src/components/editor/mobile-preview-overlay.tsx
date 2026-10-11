"use client";

import { useState } from "react";
import type { InferSelectModel } from "drizzle-orm";
import type { pages, blocks as blocksSchema } from "@/lib/db/schema";
import type { ThemeTokens } from "@/lib/templates/theme";
import { LivePreview } from "./live-preview";

type Page = InferSelectModel<typeof pages>;
type Block = InferSelectModel<typeof blocksSchema>;

interface MobilePreviewOverlayProps {
  page: Page;
  blocks: Block[];
  theme: ThemeTokens;
  activeBlockId?: string | null;
}

export function MobilePreviewOverlay({
  page,
  blocks,
  theme,
  activeBlockId,
}: MobilePreviewOverlayProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating button (mobile only) */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white shadow-lg transition-transform hover:scale-105 md:hidden"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" />
          <circle cx="8" cy="8" r="2" />
        </svg>
        Preview
      </button>

      {/* Full-screen overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white md:hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
            <span className="text-sm font-medium">Preview</span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
              </svg>
            </button>
          </div>

          {/* Preview body */}
          <div className="flex-1 overflow-auto bg-gray-100 px-4 py-6">
            <div className="mx-auto" style={{ transform: "scale(0.85)", transformOrigin: "top" }}>
              <LivePreview page={page} blocks={blocks} theme={theme} activeBlockId={activeBlockId} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
