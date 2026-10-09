import { PLAN_MATRIX } from "@/lib/entitlements";

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
export const PRICE_YEARLY_MONTHLY_EQUIVALENT = 6;

export const FREE_FEATURES = [
  `${PLAN_MATRIX.free.max_pages} page`,
  `Up to ${PLAN_MATRIX.free.max_blocks_per_page} links & blocks`,
  "6 templates",
  "5 curated color palettes",
  "6 system fonts",
  "3 button styles",
  `${PLAN_MATRIX.free.analytics_days}-day views, link clicks, top links & sources`,
  `${PLAN_MATRIX.free.max_asset_bytes / 1_000_000} MB storage`,
];

export const PRO_FEATURES = [
  "Everything in Free",
  `${PLAN_MATRIX.pro.max_pages} pages`,
  `Up to ${PLAN_MATRIX.pro.max_blocks_per_page} links & blocks`,
  "All 8 templates, including 2 premium",
  "Custom hex colors (any color)",
  "30+ Google Fonts",
  "6 button styles",
  `${PLAN_MATRIX.pro.analytics_days}-day views, link clicks, top links & sources`,
  `${PLAN_MATRIX.pro.max_asset_bytes / 1_000_000} MB storage`,
  "Remove LinkNest badge",
  "Email support",
];
