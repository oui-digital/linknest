import type { InferSelectModel } from "drizzle-orm";
import type { blocks as blocksSchema, pages } from "@/lib/db/schema";
import type { ThemeTokens } from "@/lib/templates/theme";
import { getTemplate } from "@/lib/templates";
import { PublicPageView } from "./public-page-view";
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

/** Server entry point: the public page and the dashboard preview route. */
export function TemplateRenderer({
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

  return (
    <PublicPageView
      page={page}
      blocks={blocks}
      theme={theme}
      mode={mode}
      showBadge={showBadge}
      showReport={showReport}
      runtime={runtime}
      inApp={inApp}
    />
  );
}
