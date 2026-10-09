import type { InferSelectModel } from "drizzle-orm";
import type { blocks } from "@/lib/db/schema";
import { USER_LINK_REL, isExternalPage } from "@/lib/link-rel";
import { parseBlockContent } from "@/lib/blocks/content";

type Block = InferSelectModel<typeof blocks>;

interface LinkBlockProps {
  block: Block;
  resolvedStyle?: React.CSSProperties;
}

export function LinkBlock({ block, resolvedStyle }: LinkBlockProps) {
  if (!block.url) return null;

  const { thumbnailUrl, description } = parseBlockContent("link", block.content);
  const isCard = Boolean(thumbnailUrl || description);

  // tel:/mailto: stay in the same tab; see isExternalPage().
  const external = isExternalPage(block.url);

  const baseStyle: React.CSSProperties = {
    fontFamily: "var(--ln-font-body)",
    fontSize: "var(--ln-font-size-base)",
    color: "var(--ln-btn-text)",
    backgroundColor: "var(--ln-btn-bg)",
    borderRadius: "var(--ln-btn-radius)",
    padding: isCard
      ? "calc(var(--ln-btn-py) * 0.6) var(--ln-btn-py)"
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
      className={`${
        isCard ? "flex items-center gap-3" : "block text-center"
      } w-full transition-transform hover:scale-[1.02] focus-visible:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[box-shadow:0_0_0_4px_var(--ln-color-bg)]`}
      style={resolvedStyle ? { ...baseStyle, ...resolvedStyle } : baseStyle}
    >
      {isCard ? (
        <>
          {thumbnailUrl ? (
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
          ) : (
            <span aria-hidden className="w-12 shrink-0" />
          )}
          <span className="flex min-w-0 flex-1 flex-col items-center text-center">
            <span>{label}</span>
            {description && (
              <span className="line-clamp-2 text-sm opacity-80">{description}</span>
            )}
          </span>
          {/* Balances the thumbnail so the text stays centred on the button. */}
          <span aria-hidden className="w-12 shrink-0" />
        </>
      ) : (
        label
      )}
    </a>
  );
}
