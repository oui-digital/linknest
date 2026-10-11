import { parseBlockContent } from "@/lib/blocks/content";
import { isExternalPage } from "@/lib/link-rel";

/**
 * schema.org ProfilePage for a public page.
 *
 * Search engines read the structured data to attach the page to the person or
 * business it is about; without it a link-in-bio page is just a list of links.
 * `sameAs` carries the social-icon destinations (the page's identity links),
 * never ordinary link blocks.
 */

export type EntityKind = "person" | "organization";

type PageFields = {
  title: string;
  bio: string | null;
  avatarUrl: string | null;
  // Date on a cold cache, ISO string on a warm one (see src/lib/public-page.ts).
  createdAt: Date | string;
  updatedAt: Date | string;
};

type BlockFields = {
  type: string;
  content: unknown;
  isVisible: boolean;
};

export function profilePageJsonLd({
  page,
  blocks,
  canonicalUrl,
  entityKind = "person",
}: {
  page: PageFields;
  blocks: BlockFields[];
  canonicalUrl: string;
  entityKind?: EntityKind;
}) {
  const sameAs = [
    ...new Set(
      blocks
        .filter((block) => block.type === "socials" && block.isVisible)
        .flatMap((block) => parseBlockContent("socials", block.content).items ?? [])
        .map((item) => item.url)
        .filter(isExternalPage),
    ),
  ];

  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    dateCreated: toIso(page.createdAt),
    dateModified: toIso(page.updatedAt),
    mainEntity: {
      "@type": entityKind === "organization" ? "Organization" : "Person",
      name: page.title,
      ...(page.bio ? { description: page.bio } : {}),
      ...(page.avatarUrl ? { image: page.avatarUrl } : {}),
      url: canonicalUrl,
      ...(sameAs.length > 0 ? { sameAs } : {}),
    },
  };
}

/**
 * JSON for an inline <script>. `<` is escaped so page content containing
 * "</script>" (a bio, a label) cannot end the element early.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}
