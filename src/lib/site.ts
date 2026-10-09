/**
 * Canonical public origin of the app.
 *
 * Used for metadataBase, sitemap/robots URLs, email links and Stripe return
 * URLs. Several call sites previously interpolated `process.env.AUTH_URL`
 * directly, which silently produced strings like "undefined/dashboard/billing"
 * when unset.
 */

export type SiteUrlEnv = {
  NEXT_PUBLIC_SITE_URL?: string;
  AUTH_URL?: string;
  VERCEL_ENV?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_BRANCH_URL?: string;
  VERCEL_URL?: string;
};

/**
 * Resolve the origin from the environment. Explicit configuration wins.
 *
 * The Vercel production domain is a fallback ONLY on production deployments.
 * A Preview deployment that fell back to it generated production links in its
 * emails, metadata and billing return URLs — a test confirmation button opened
 * the live site. Previews fall back to their own branch URL; anything else
 * (local development, `next start` smoke tests) falls back to localhost.
 */
export function resolveSiteUrl(env: SiteUrlEnv): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL || env.AUTH_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  if (env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  const branch = env.VERCEL_BRANCH_URL || env.VERCEL_URL;
  if (env.VERCEL_ENV === "preview" && branch) {
    return `https://${branch}`;
  }

  return "http://localhost:3000";
}

// Property access stays spelled out so Next.js can inline NEXT_PUBLIC_SITE_URL
// into client bundles; reading through a passed-in `process.env` would not be.
export const SITE_URL = resolveSiteUrl({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  AUTH_URL: process.env.AUTH_URL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
  VERCEL_URL: process.env.VERCEL_URL,
});

/** Absolute URL for a path within the app. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
