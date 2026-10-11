import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Public pages are user-generated and must never be framable: the product's
// whole premise is "this link really is me", so allowing an attacker to iframe
// @someone inside a fake wrapper is a ready-made phishing primitive.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    // Two root layouts (the site, and public pages with a per-page <html
    // lang>) leave no layout to compose a global 404 from; this renders
    // src/app/global-not-found.tsx for unmatched URLs instead.
    globalNotFound: true,
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry org/project config — only needed if SENTRY_AUTH_TOKEN is set for source maps
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Suppress source map upload warnings when SENTRY_AUTH_TOKEN is not set
  silent: !process.env.SENTRY_AUTH_TOKEN,
});
