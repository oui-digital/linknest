// src/lib/slugs.ts — Reserved slug denylist + validation
// Checked on page/workspace slug creation and update.

// System routes — hard block, cannot be claimed by anyone
const SYSTEM_SLUGS = new Set([
  "dashboard",
  "login",
  "signup",
  "pricing",
  "api",
  "admin",
  "settings",
  "billing",
  "auth",
  "callback",
  "help",
  "support",
  "about",
  "terms",
  "privacy",
  "blog",
  "docs",
  "status",
  "health",
  "robots.txt",
  "sitemap.xml",
  "favicon.ico",
  "_next",
  "static",
  "subscribe",
]);

// High-value slugs — reserved for future manual assignment or premium tiers.
// Don't let a random free user grab @john or @pizza on day 1.
// In production, load from a static JSON file (top 500 common first names + generic nouns).
// For now, a representative set to get started.
const PREMIUM_SLUGS = new Set([
  // Common first names
  "john",
  "jane",
  "james",
  "david",
  "michael",
  "sarah",
  "emma",
  "alex",
  "chris",
  "matt",
  "mike",
  "sam",
  "tom",
  "nick",
  "max",
  "ben",
  "joe",
  "jack",
  "kate",
  "anna",
  "maria",
  "lisa",
  "amy",
  "dan",
  "mark",
  "paul",
  "ryan",
  "adam",
  "eric",
  "kevin",
  // Generic nouns / high-value slugs
  "music",
  "art",
  "design",
  "photo",
  "video",
  "shop",
  "store",
  "links",
  "link",
  "me",
  "my",
  "home",
  "bio",
  "portfolio",
  "work",
  "contact",
  "hire",
  "brand",
  "creator",
  "studio",
  "agency",
  "team",
  "pro",
  "vip",
  "official",
  "news",
  "tech",
  "dev",
  "code",
  "web",
  "app",
  "game",
  "food",
  "travel",
  "fitness",
  "health",
  "beauty",
  "fashion",
  "style",
]);

const RESERVED_SLUGS = new Set([...SYSTEM_SLUGS, ...PREMIUM_SLUGS]);

// Slug format: 3-63 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens
const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

export type SlugValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Canonical form of a slug. This is what must be written to the database and
 * used for lookups — `pages.slug` comparisons are case-sensitive, so storing
 * unnormalized input makes the page unreachable at its own URL and lets a
 * second account claim a case-variant of an existing handle.
 */
export function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/**
 * Validate a slug for format and reserved words.
 * Does NOT check database uniqueness — that's a separate query.
 *
 * Returns a result object, which is ALWAYS truthy — callers must branch on
 * `.valid`, never on the return value itself.
 */
export function validateSlug(slug: string): SlugValidationResult {
  if (!slug) {
    return { valid: false, reason: "Username is required." };
  }

  const normalized = normalizeSlug(slug);

  if (normalized.length < 3) {
    return { valid: false, reason: "Username must be at least 3 characters." };
  }

  if (normalized.length > 63) {
    return { valid: false, reason: "Username must be 63 characters or fewer." };
  }

  if (!SLUG_REGEX.test(normalized)) {
    return {
      valid: false,
      reason:
        "Username can only contain lowercase letters, numbers, and hyphens. It cannot start or end with a hyphen.",
    };
  }

  if (RESERVED_SLUGS.has(normalized)) {
    return { valid: false, reason: "This username is reserved. Try another." };
  }

  return { valid: true };
}

/**
 * Check if a slug is a system route (used by middleware to detect collisions).
 */
export function isSystemSlug(slug: string): boolean {
  return SYSTEM_SLUGS.has(slug.toLowerCase());
}

/**
 * Check if a slug is reserved (system + premium).
 */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

/**
 * Build the canonical public URL for a page slug.
 * All in-app links to public pages must use this helper.
 */
export function getPublicPageUrl(slug: string): string {
  return `/@${slug}`;
}
