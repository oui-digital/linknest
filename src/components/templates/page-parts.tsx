import Link from "next/link";
import type { InferSelectModel } from "drizzle-orm";
import type { blocks as blocksSchema, pages } from "@/lib/db/schema";
import type { LayoutType } from "@/lib/templates";
import type { ThemeTokens, BlockStyleOverrides } from "@/lib/templates/theme";
import {
  themeToCssVars,
  computeBlockResolvedStyle,
  featuredLinkStyle,
} from "@/lib/templates/theme";
import { getGoogleFontsUrl } from "@/lib/templates/fonts";
import { parseBlockContent } from "@/lib/blocks/content";
import { BlockRenderer } from "@/components/blocks/block-renderer";
import { AvatarFallback } from "@/components/ui/avatar-fallback";

type Page = InferSelectModel<typeof pages>;
type Block = InferSelectModel<typeof blocksSchema>;

export type RenderMode = "public" | "preview";

// ─── Building blocks shared by every entry point ───────────────────────────
// Composed by PublicPageView. Exported so nothing re-implements them again:
// the editor preview used to carry its own copy of the header and block
// column, which drifted (no Google Fonts, no grid layouts, different sizes).

/** Root element: theme CSS variables, background, fonts, page padding. */
export function PageFrame({
  theme,
  className = "min-h-screen",
  top,
  children,
}: {
  theme: ThemeTokens;
  className?: string;
  /** Full-width content above the page container (the announcement banner). */
  top?: React.ReactNode;
  children: React.ReactNode;
}) {
  const cssVars = themeToCssVars(theme);

  const backgroundStyle: React.CSSProperties = {};
  if (theme.backgroundEffect === "gradient" && theme.backgroundGradient) {
    backgroundStyle.backgroundImage = theme.backgroundGradient;
  }

  // Load only the Google font families this page actually selected. Without
  // this the family name was written into the CSS stack but no font file was
  // ever requested, so every Pro font silently rendered as the fallback.
  const googleFontsUrl = getGoogleFontsUrl([theme.fontHeading, theme.fontBody]);

  return (
    <div
      className={className}
      style={{
        ...cssVars,
        backgroundColor: "var(--ln-color-bg)",
        color: "var(--ln-color-text)",
        fontFamily: "var(--ln-font-body)",
        fontSize: "var(--ln-font-size-base)",
        lineHeight: "var(--ln-line-height-body)",
        ...backgroundStyle,
      } as React.CSSProperties}
    >
      {googleFontsUrl && (
        <>
          {/* The stylesheet is render-blocking and cross-origin, so the browser
              otherwise pays DNS + TCP + TLS to two new hosts before it can even
              start parsing it. Preconnecting overlaps that with HTML parsing —
              worth ~100-300ms on mobile. gstatic is where the woff2 lives and
              needs crossOrigin to match the font's CORS fetch. */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossOrigin=""
          />
          <link rel="stylesheet" href={googleFontsUrl} precedence="default" />
        </>
      )}
      {top}
      <div
        className="mx-auto"
        style={{
          maxWidth: "var(--ln-content-max-width)",
          paddingLeft: "var(--ln-page-px)",
          paddingRight: "var(--ln-page-px)",
          paddingTop: "var(--ln-page-py)",
          paddingBottom: "var(--ln-page-py)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ page }: { page: Page }) {
  return (
    <div className="mb-10 flex flex-col items-center text-center">
      <div className="mb-4">
        <AvatarFallback
          avatarUrl={page.avatarUrl}
          name={page.title}
          slug={page.slug}
          size={96}
        />
      </div>
      <p
        className="mb-1 text-sm font-medium"
        style={{ color: "var(--ln-color-text-muted)" }}
      >
        @{page.slug}
      </p>
      <h1
        style={{
          fontFamily: "var(--ln-font-heading)",
          fontWeight: "var(--ln-font-weight-heading)",
          fontSize: "var(--ln-font-size-h1)",
          color: "var(--ln-color-text)",
        }}
      >
        {page.title}
      </h1>
      {page.bio && (
        <p
          className="mt-1 max-w-md"
          style={{ color: "var(--ln-color-text-muted)" }}
        >
          {page.bio}
        </p>
      )}
    </div>
  );
}

export function PageFooter({
  pageId,
  mode,
  showBadge,
  showReport,
}: {
  pageId: string;
  mode: RenderMode;
  showBadge: boolean;
  showReport: boolean;
}) {
  if (!showBadge && !showReport) return null;
  const linkStyle = {
    color: "var(--ln-color-text-muted)",
    outlineColor: "var(--ln-color-text)",
  };
  return (
    <footer className="mt-16 flex flex-col items-center gap-2 text-center">
      {showBadge &&
        (mode === "preview" ? (
          // Not a link in the editor: following it would leave the editor.
          <span className="text-xs" style={{ color: "var(--ln-color-text-muted)" }}>
            Made with LinkNest
          </span>
        ) : (
          <Link
            href="/"
            className="rounded text-xs transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={linkStyle}
          >
            Made with LinkNest
          </Link>
        ))}
      {showReport && mode === "public" && (
        // No inline opacity: at 0.5 this composited to 1.8–2.7:1 against
        // every template background, well under the 4.5:1 AA minimum. The
        // inline value also beat the `hover:opacity-80` class, so the hover
        // state never fired. 14px is the spec's own minimum text size.
        <a
          href={`/report/${pageId}`}
          className="rounded text-sm transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={linkStyle}
        >
          Report this page
        </a>
      )}
    </footer>
  );
}

function resolveBlockStyle(
  theme: ThemeTokens,
  block: Block,
): React.CSSProperties | undefined {
  const content = parseBlockContent(block.type, block.content);
  const overrides = content.styleOverrides as BlockStyleOverrides | undefined;
  const featured = block.type === "link" && content.featured === true;

  let style: Record<string, string> = featured ? featuredLinkStyle(theme) : {};
  if (overrides && Object.keys(overrides).length > 0) {
    style = { ...style, ...computeBlockResolvedStyle(theme, overrides) };
  }
  return Object.keys(style).length > 0 ? (style as React.CSSProperties) : undefined;
}

export function BlockLayout({
  layout,
  blocks,
  theme,
  mode,
}: {
  layout: LayoutType;
  blocks: Block[];
  theme: ThemeTokens;
  mode: RenderMode;
}) {
  // Hidden blocks are dropped before any wrapper is created, so they can never
  // leave an empty slot (the editor preview receives every block).
  const visible = blocks
    .filter((block) => block.isVisible)
    .sort((a, b) => a.position - b.position);

  const children = visible.map((block) => (
    <BlockRenderer
      key={block.id}
      block={block}
      mode={mode}
      resolvedStyle={resolveBlockStyle(theme, block)}
    />
  ));

  // card-grid and bento-grid still stack; real grids come in a later change.
  return (
    <div
      className="flex flex-col"
      style={{
        gap: "var(--ln-block-gap)",
        alignItems: layout === "left-aligned" ? "flex-start" : "center",
        // Rows of inline items (social icons) follow the column's alignment.
        ["--ln-justify" as string]: layout === "left-aligned" ? "flex-start" : "center",
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
