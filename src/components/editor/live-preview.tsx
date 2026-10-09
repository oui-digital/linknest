"use client";

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
}

/**
 * The editor's phone frame. Everything inside it is the same composition the
 * public page renders, in preview mode: interactive blocks are inert and the
 * badge is not a link.
 */
export function LivePreview({ page, blocks, theme }: LivePreviewProps) {
  return (
    <div className="relative">
      <div className="h-[700px] w-[375px] overflow-hidden rounded-[2.5rem] border-[8px] border-gray-800 bg-white shadow-xl">
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
