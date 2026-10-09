import type { InferSelectModel } from "drizzle-orm";
import type { blocks } from "@/lib/db/schema";
import { parseBlockContent } from "@/lib/blocks/content";
import { platformName } from "@/lib/social-platforms";
import { USER_LINK_REL, isExternalPage } from "@/lib/link-rel";
import { SOCIAL_ICONS } from "./social-icons";

type Block = InferSelectModel<typeof blocks>;

/**
 * A row of round icon buttons, styled with the theme's button tokens.
 *
 * Icon-only anchors have no text, so each carries an accessible name and a
 * `data-link-label` for analytics (the beacon would otherwise record an empty
 * label).
 */
export function SocialsBlock({ block }: { block: Block }) {
  const items = parseBlockContent("socials", block.content).items ?? [];
  if (items.length === 0) return null;

  return (
    <ul
      className="flex w-full flex-wrap gap-3"
      style={{ justifyContent: "var(--ln-justify, center)" }}
    >
      {items.map((item) => {
        const Icon = SOCIAL_ICONS[item.platform];
        const name = item.label || platformName(item.platform);
        const external = isExternalPage(item.url);
        return (
          <li key={item.url}>
            <a
              href={item.url}
              {...(external ? { target: "_blank", rel: USER_LINK_REL } : {})}
              aria-label={name}
              title={name}
              data-link-id={block.id}
              data-link-label={name}
              className="flex h-11 w-11 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                color: "var(--ln-btn-text)",
                backgroundColor: "var(--ln-btn-bg)",
                borderWidth: "var(--ln-btn-border-w)",
                borderColor: "var(--ln-btn-border-c)",
                borderStyle: "solid",
                boxShadow: "var(--ln-btn-shadow)",
                backdropFilter: "var(--ln-btn-backdrop)",
                WebkitBackdropFilter: "var(--ln-btn-backdrop)",
                outlineColor: "var(--ln-color-text)",
              }}
            >
              <Icon size={20} aria-hidden focusable="false" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
