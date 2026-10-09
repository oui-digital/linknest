// src/lib/entitlements.ts — the ONLY place plan limits are defined

export const PLAN_MATRIX = {
  free: {
    max_pages: 1,
    max_blocks_per_page: 50,
    premium_templates: false,
    custom_colors: false, // curated palettes only; no hex input
    google_fonts: false,
    animated_buttons: false,
    analytics_days: 7,
    remove_badge: false,
    max_asset_bytes: 50_000_000, // 50MB total
    max_subscribers: 100, // confirmed email subscribers, across all pages
    subscriber_export: false,
  },
  pro: {
    max_pages: 5,
    max_blocks_per_page: 100,
    premium_templates: true,
    custom_colors: true, // full hex color picker
    google_fonts: true,
    animated_buttons: true,
    analytics_days: 90,
    remove_badge: true,
    max_asset_bytes: 500_000_000, // 500MB total
    max_subscribers: Number.POSITIVE_INFINITY,
    subscriber_export: true, // CSV download
  },
} as const;

export type PlanId = keyof typeof PLAN_MATRIX;
export type Feature = keyof (typeof PLAN_MATRIX)["free"];
export type EntitlementValue =
  | (typeof PLAN_MATRIX)["free"][Feature]
  | (typeof PLAN_MATRIX)["pro"][Feature];

/**
 * Get the entitlement value for a plan + feature.
 *
 * Plan-level overrides (comped accounts) are applied earlier, by
 * getUserWorkspace() in src/lib/queries.ts — it substitutes the effective plan
 * before it reaches any gate, so everything here operates on the resolved plan.
 * Per-feature overrides are not implemented.
 */
export function getEntitlement(plan: PlanId, feature: Feature): EntitlementValue {
  return PLAN_MATRIX[plan][feature];
}

/**
 * Check if a workspace has access to a boolean feature.
 */
export function hasFeature(plan: PlanId, feature: Feature): boolean {
  return !!PLAN_MATRIX[plan][feature];
}

/**
 * Get the numeric limit for a feature.
 */
export function getLimit(plan: PlanId, feature: Feature): number {
  const value = PLAN_MATRIX[plan][feature];
  if (typeof value !== "number") {
    throw new Error(`Feature "${feature}" is not a numeric limit`);
  }
  return value;
}
