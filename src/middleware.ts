import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Known app route prefixes that must NEVER be treated as user slugs.
// Defense-in-depth layer — the primary guard is the slug denylist at creation time.
const APP_ROUTES = new Set([
  // Direct /api requests never reach middleware (see `config.matcher`); this
  // entry stops /@api/... from being rewritten into an alias of every route.
  "/api",
  "/dashboard",
  "/login",
  "/signup",
  "/pricing",
  "/auth",
  "/admin",
  "/settings",
  "/billing",
  "/help",
  "/support",
  "/about",
  "/terms",
  "/privacy",
  "/blog",
  "/docs",
  "/status",
  "/onboarding",
  "/check-email",
  "/subscribe",
  "/report",
]);

function isAppRoute(pathname: string): boolean {
  return (
    APP_ROUTES.has(pathname) ||
    [...APP_ROUTES].some((route) => pathname.startsWith(route + "/"))
  );
}

// Auth.js v5 middleware wrapper — `req.auth` contains the session (or null).
export default auth((req) => {
  const { pathname } = req.nextUrl;

  // ─── 1. Handle /@slug → rewrite to /slug (public page) ─────────────────
  if (pathname.startsWith("/@")) {
    const rest = pathname.slice(2); // strip "/@"
    const slashAt = rest.indexOf("/");
    const handle = slashAt === -1 ? rest : rest.slice(0, slashAt);
    const tail = slashAt === -1 ? "" : rest.slice(slashAt);
    const canonicalHandle = handle.toLowerCase();

    // If the slug (after stripping @) maps to an app route, hard 404.
    // This is a defense-in-depth check — the slug denylist prevents creation,
    // but middleware guarantees 404 even if the denylist is bypassed.
    if (isAppRoute(`/${canonicalHandle}${tail}`)) {
      return NextResponse.rewrite(new URL("/not-found", req.url));
    }

    // Slugs are stored lowercase and the page lookup lowercases too, so
    // /@OuiDigital rendered the same page as /@ouidigital with a 200 — two
    // URLs for one page. Send mixed case to the canonical spelling instead.
    // Cloning nextUrl keeps the query string (?utm_source=…) on the redirect.
    if (canonicalHandle !== handle) {
      const url = req.nextUrl.clone();
      url.pathname = `/@${canonicalHandle}${tail}`;
      return NextResponse.redirect(url, 308);
    }

    // Rewrite /@slug to /slug (serves src/app/(public)/[username]/page.tsx)
    // Query params (e.g., ?preview=true) pass through the rewrite automatically.
    const url = req.nextUrl.clone();
    url.pathname = `/${rest}`;
    return NextResponse.rewrite(url);
  }

  // ─── 2. Auth guard for dashboard routes ─────────────────────────────────
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding")) {
    if (!req.auth?.user) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // ─── 3. SEO canonicalization: /slug → 308 to /@slug ─────────────────────
  // Only for bare paths that are NOT app routes, NOT the root, and look like
  // they could be a user slug. This ensures one canonical URL per public page.
  if (
    !isAppRoute(pathname) &&
    pathname !== "/" &&
    !pathname.startsWith("/@") &&
    // Only single-segment paths (no nested paths like /foo/bar)
    !pathname.slice(1).includes("/") &&
    // Never redirect static files served from public/. Slugs cannot contain a
    // dot, so anything with one is an asset — without this, every request for
    // /linknest-logo.svg paid a 301 round-trip to /@linknest-logo.svg.
    !pathname.slice(1).includes(".")
  ) {
    // Clone nextUrl rather than building a fresh URL: `new URL(path, base)`
    // dropped the query string, so /slug?utm_source=x lost its attribution on
    // the hop. Lowercase here too, or /OuiDigital would need a second hop.
    const url = req.nextUrl.clone();
    url.pathname = `/@${pathname.slice(1).toLowerCase()}`;
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip _next, api, static files entirely — these never enter middleware logic
    "/((?!_next|api|static|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};
