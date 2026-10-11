import "@/app/globals.css";
import { getPublicPageData } from "@/lib/public-page";
import { isRtl, pageLanguage } from "@/lib/languages";

/**
 * Root layout for public pages.
 *
 * `<html lang>` was hard-coded to English in one root layout for the whole
 * app, so a French page was announced and spell-checked as English. This
 * segment has its own root layout (the next-intl `[locale]` pattern), reading
 * the page's language; the rest of the site keeps its root layout under
 * `(main)`. Navigating between the two is a full page load, which these
 * routes never do (public pages open in a new tab from the dashboard).
 *
 * Public pages deliberately mount no analytics provider: posthog-js used to
 * wrap them, costing ~50 KB brotli of client JS on the product's most
 * performance-sensitive route. Tracking runs through <PageBeacon>, mounted by
 * the page itself. No site fonts either: a public page renders in the fonts
 * its own theme selects.
 */
export default async function PublicPageLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  // Deduped with the page and generateMetadata by React cache().
  const data = await getPublicPageData(username);
  const lang = pageLanguage(data?.page.language);

  return (
    <html lang={lang} dir={isRtl(lang) ? "rtl" : undefined}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
