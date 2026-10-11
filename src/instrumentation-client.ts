import * as Sentry from "@sentry/nextjs";

/**
 * Browser Sentry bootstrap.
 *
 * Replaces sentry.client.config.ts, which Turbopack does not load — and Next 16
 * builds with Turbopack, so the old file was dead code regardless of whether a
 * DSN was set.
 *
 * Public pages (/@slug — the rewrite keeps that URL in the browser) report
 * errors only. The default BrowserSession integration sent a session envelope
 * on every visitor pageview, and the pageload transaction inherited the
 * server's sampling decision from the sentry-trace meta tag; a sampler
 * function overrides that inheritance. The dashboard keeps both.
 */
const isPublicPage =
  typeof location !== "undefined" && location.pathname.startsWith("/@");

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampler: () => (isPublicPage ? 0 : 0.1),
  integrations: (defaults) =>
    isPublicPage ? defaults.filter((i) => i.name !== "BrowserSession") : defaults,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  // Public pages are user-generated content; keep URLs but drop anything that
  // could carry a visitor's input.
  sendDefaultPii: false,

  // Instagram's Android in-app browser injects a perf logger that throws when
  // the webview closes mid-report. Not our code; drop it.
  denyUrls: [/^app:\/\/navigation_performance_logger/],
  ignoreErrors: ["Java object is gone"],
});

/** Lets Sentry tie client-side navigations to their originating transaction. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
