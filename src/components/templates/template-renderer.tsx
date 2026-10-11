import type { InferSelectModel } from "drizzle-orm";
import type { blocks as blocksSchema, pages } from "@/lib/db/schema";
import type { ThemeTokens } from "@/lib/templates/theme";
import { getTemplate } from "@/lib/templates";
import { PublicPageView } from "./public-page-view";
import { resolveThemeFonts } from "@/lib/templates/font-loader";
import type { RenderMode } from "./page-parts";
import type { BlockRuntime } from "@/components/blocks/block-runtime";
import type { InAppEscape } from "@/lib/in-app-browser";

type Page = InferSelectModel<typeof pages>;
type Block = InferSelectModel<typeof blocksSchema>;

interface TemplateRendererProps {
  page: Page;
  blocks: Block[];
  showBadge?: boolean;
  showReport?: boolean;
  /** "preview" renders interactive blocks inert (dashboard preview). */
  mode?: RenderMode;
  /** Server-computed values for interactive blocks (Turnstile, list state). */
  runtime?: Omit<BlockRuntime, "mode" | "pageId" | "pageTitle" | "cta">;
  /** Server-detected Meta in-app browser; the public route only. */
  inApp?: InAppEscape;
}

/**
 * Server entry point: the public page and the dashboard preview route.
 *
 * Async because the theme's Google fonts are resolved to self-hosted files
 * here (src/lib/templates/font-loader.ts); the editor's client preview
 * renders PublicPageView directly and keeps the Google stylesheet.
 */
export async function TemplateRenderer({
  page,
  blocks,
  showBadge = true,
  showReport = false,
  mode = "public",
  runtime,
  inApp,
}: TemplateRendererProps) {
  const template = getTemplate(page.templateId);
  const theme = {
    ...template.defaultTheme,
    ...(page.theme as Partial<ThemeTokens>),
  } as ThemeTokens;
  const fonts = await resolveThemeFonts(theme);

  return (
    <PublicPageView
      page={page}
      blocks={blocks}
      theme={theme}
      fonts={fonts}
      mode={mode}
      showBadge={showBadge}
      showReport={showReport}
      runtime={runtime}
      inApp={inApp}
    />
  );
}
