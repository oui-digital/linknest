import type { InferSelectModel } from "drizzle-orm";
import type { blocks as blocksSchema, pages } from "@/lib/db/schema";
import type { ThemeTokens } from "@/lib/templates/theme";
import { getTemplate } from "@/lib/templates";
import { getContrastColor } from "@/lib/contrast";
import { StickyBanner } from "@/components/blocks/sticky-banner";
import {
  BlockRuntimeProvider,
  type BlockRuntime,
} from "@/components/blocks/block-runtime";
import {
  BlockLayout,
  PageFooter,
  PageFrame,
  PageHeader,
  type RenderMode,
} from "./page-parts";

type Page = InferSelectModel<typeof pages>;
type Block = InferSelectModel<typeof blocksSchema>;

/**
 * The one composition of a public page, used by the public route, the
 * dashboard preview and the editor's phone frame alike.
 *
 * It always renders the BlockRuntimeProvider, so interactive (client) blocks
 * have their runtime values on every entry point by construction. It has no
 * "use client" directive: rendered from a server component it stays on the
 * server; rendered from the editor it runs on the client.
 */
export function PublicPageView({
  page,
  blocks,
  theme,
  mode,
  showBadge,
  showReport,
  runtime,
  frameClassName,
}: {
  page: Page;
  blocks: Block[];
  /** The effective theme (template defaults merged with the page's overrides). */
  theme: ThemeTokens;
  mode: RenderMode;
  showBadge: boolean;
  showReport: boolean;
  runtime?: Omit<BlockRuntime, "mode" | "pageId" | "pageTitle" | "cta">;
  frameClassName?: string;
}) {
  const layout = getTemplate(page.templateId).layout;

  return (
    <BlockRuntimeProvider
      value={{
        ...runtime,
        mode,
        pageId: page.id,
        pageTitle: page.title,
        cta: {
          background: theme.colorPrimary,
          color: getContrastColor(theme.colorPrimary),
        },
      }}
    >
      <PageFrame
        theme={theme}
        className={frameClassName}
        top={
          page.banner ? (
            <StickyBanner
              banner={page.banner}
              background={theme.colorPrimary}
              foreground={getContrastColor(theme.colorPrimary)}
            />
          ) : null
        }
      >
        {/* The page had no landmarks at all bar the footer. <main> stays inside
            the frame so it keeps the theme's max-width and padding, and the
            <footer> stays OUTSIDE it — a footer nested in <main> maps to
            "generic" rather than "contentinfo". */}
        <main>
          <PageHeader page={page} />
          <BlockLayout layout={layout} blocks={blocks} theme={theme} mode={mode} />
        </main>
        <PageFooter
          pageId={page.id}
          mode={mode}
          showBadge={showBadge}
          showReport={showReport}
        />
      </PageFrame>
    </BlockRuntimeProvider>
  );
}
