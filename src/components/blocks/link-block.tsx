import type { InferSelectModel } from "drizzle-orm";
import type { blocks } from "@/lib/db/schema";
import { USER_LINK_REL, isExternalPage } from "@/lib/link-rel";
import { parseBlockContent } from "@/lib/blocks/content";

type Block = InferSelectModel<typeof blocks>;

interface LinkBlockProps {
  block: Block;
  resolvedStyle?: React.CSSProperties;
  tile?: boolean;
}

export function LinkBlock({ block, resolvedStyle, tile = false }: LinkBlockProps) {
  if (!block.url) return null;

  const { thumbnailUrl, description, featured } = parseBlockContent("link", block.content);
  const isCard = !tile && Boolean(thumbnailUrl || description);
  // Featured links never tile (they always span the grid; see gridPlacement).
  const isFeatured = featured === true;

  // tel:/mailto: stay in the same tab; see isExternalPage().
  const external = isExternalPage(block.url);

  const baseStyle: React.CSSProperties = {
    fontFamily: "var(--ln-font-body)",
    fontSize: "var(--ln-font-size-base)",
    color: "var(--ln-btn-text)",
    backgroundColor: "var(--ln-btn-bg)",
    borderRadius: "var(--ln-btn-radius)",
    // Featured is taller; its horizontal padding stays the mode's own, so a
    // featured card's text column is as wide as a plain card's.
    padding: tile
      ? "calc(var(--ln-btn-py) * 1.25)"
      : isCard
        ? `calc(var(--ln-btn-py) * ${isFeatured ? 1.25 : 0.6}) var(--ln-btn-py)`
        : isFeatured
          ? "calc(var(--ln-btn-py) * 1.25) var(--ln-btn-px)"
          : "var(--ln-btn-py) var(--ln-btn-px)",
    borderWidth: "var(--ln-btn-border-w)",
    borderColor: "var(--ln-btn-border-c)",
    borderStyle: "solid",
    boxShadow: "var(--ln-btn-shadow)",
    backdropFilter: "var(--ln-btn-backdrop)",
    WebkitBackdropFilter: "var(--ln-btn-backdrop)",
    // Two-tone focus ring. Deliberately NOT built from --ln-color-accent: on
    // several templates the accent is byte-identical to the button's resting
    // border (so focus would look the same as blur), and the accent is
    // user-editable, meaning a page owner could tune their own focus indicator
    // into invisibility. Text-on-background always contrasts by construction,
    // and the outer halo guarantees a visible edge whichever side it lands on.
    outlineColor: "var(--ln-color-text)",
  };

  const label = block.label || block.url;

  return (
    <a
      href={block.url}
      {...(external ? { target: "_blank", rel: USER_LINK_REL } : {})}
      data-link-id={block.id}
      // The label alone: the description must not end up in analytics.
      data-link-label={block.label ?? undefined}
      // wrap-anywhere is inherited by every label and description. Not
      // break-words: in card and tile modes those spans are centred flex items
      // sized to fit their content, and break-word does not shrink that size,
      // so a long URL label still pushed past the button's edge.
      className={`${
        tile
          ? "flex h-full flex-col items-center justify-center gap-2 text-center"
          : isCard
            ? "flex items-center gap-3"
            : "block text-center"
      } w-full wrap-anywhere transition-transform hover:scale-[1.02] focus-visible:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[box-shadow:0_0_0_4px_var(--ln-color-bg)]`}
      style={resolvedStyle ? { ...baseStyle, ...resolvedStyle } : baseStyle}
    >
      {tile ? (
        <>
          {thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailUrl}
              alt=""
              width={48}
              height={48}
              loading="lazy"
              className="h-12 w-12 shrink-0 rounded-full object-cover"
            />
          )}
          <span className="line-clamp-3">{label}</span>
          {description && <span className="line-clamp-2 text-sm opacity-80">{description}</span>}
        </>
      ) : isCard ? (
        <>
          {thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailUrl}
              alt=""
              width={48}
              height={48}
              loading="lazy"
              className="h-12 w-12 shrink-0 object-cover"
              style={{ borderRadius: "calc(var(--ln-btn-radius) * 0.6)" }}
            />
          )}
          <span className="flex min-w-0 flex-1 flex-col items-center text-center">
            <span>{label}</span>
            {description && (
              <span className="line-clamp-2 text-sm opacity-80">{description}</span>
            )}
          </span>
          {/* Balances the thumbnail so the text stays centred on the button.
              Without a thumbnail there is nothing to balance: both side boxes
              go and the text gets the card's full width. */}
          {thumbnailUrl && <span aria-hidden className="w-12 shrink-0" />}
        </>
      ) : (
        label
      )}
    </a>
  );
}
