import { PLAN_MATRIX } from "@/lib/entitlements";
import { TEMPLATES } from "@/lib/templates";
import { COLOR_PALETTES, FREE_BUTTON_STYLES, GOOGLE_FONTS, PRO_BUTTON_STYLES, SYSTEM_FONTS } from "@/lib/templates/theme";

/**
 * Single source of truth for customer-facing plan copy.
 *
 * The pricing page and the marketing homepage previously kept two hardcoded
 * copies of these lists, which had already drifted apart — and several entries
 * described features the code does not implement. Deriving the numbers from
 * PLAN_MATRIX means a limit change cannot silently contradict the marketing.
 *
 * Claims deliberately NOT made here, because they are not built:
 *   - "Unlimited links"  — blocks are capped (see max_blocks_per_page)
 *   - "animations"       — no animated button styles exist
 *   - "geo"/"unique visitors" — no location or visitor identity is collected
 *   - "free trial"       — checkout creates no trial period
 */
export const PRICE_MONTHLY = 8;
export const PRICE_YEARLY = 72;
export const PRICE_YEARLY_MONTHLY_EQUIVALENT = PRICE_YEARLY / 12;
export const YEARLY_SAVINGS_PERCENT = Math.round((1 - PRICE_YEARLY / (PRICE_MONTHLY * 12)) * 100);

export const PLAN_FACTS = {
  free: {
    ...PLAN_MATRIX.free,
    templates: TEMPLATES.filter((template) => template.tier === "free").length,
    palettes: COLOR_PALETTES.length,
    fonts: SYSTEM_FONTS.length,
    buttonStyles: FREE_BUTTON_STYLES.length,
  },
  pro: {
    ...PLAN_MATRIX.pro,
    templates: TEMPLATES.length,
    premiumTemplates: TEMPLATES.filter((template) => template.tier === "pro").length,
    googleFonts: GOOGLE_FONTS.length,
    buttonStyles: PRO_BUTTON_STYLES.length,
  },
} as const;

export const FREE_FEATURES = [
  `${PLAN_MATRIX.free.max_pages} page`,
  `Up to ${PLAN_MATRIX.free.max_blocks_per_page} links & blocks`,
  `${PLAN_FACTS.free.templates} templates`,
  `${PLAN_FACTS.free.palettes} curated color palettes`,
  `${PLAN_FACTS.free.fonts} system fonts`,
  `${PLAN_FACTS.free.buttonStyles} button styles`,
  `${PLAN_MATRIX.free.analytics_days}-day views, link clicks, top links & sources`,
  `${PLAN_MATRIX.free.max_asset_bytes / 1_000_000} MB storage`,
  `Email sign-ups (up to ${PLAN_MATRIX.free.max_subscribers} subscribers)`,
];

export const PRO_FEATURES = [
  "Everything in Free",
  `${PLAN_MATRIX.pro.max_pages} pages`,
  `Up to ${PLAN_MATRIX.pro.max_blocks_per_page} links & blocks`,
  `All ${PLAN_FACTS.pro.templates} templates, including ${PLAN_FACTS.pro.premiumTemplates} premium`,
  "Custom hex colors (any color)",
  `${PLAN_FACTS.pro.googleFonts}+ Google Fonts`,
  `${PLAN_FACTS.pro.buttonStyles} button styles`,
  `${PLAN_MATRIX.pro.analytics_days}-day views, link clicks, top links & sources`,
  `${PLAN_MATRIX.pro.max_asset_bytes / 1_000_000} MB storage`,
  "Remove LinkNest badge",
  "Unlimited email subscribers + CSV export",
  "Email support",
];
