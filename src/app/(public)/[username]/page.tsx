import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { TemplateRenderer } from "@/components/templates/template-renderer";
import { PageBeacon } from "@/components/analytics/page-beacon";
import type { ThemeTokens } from "@/lib/templates/theme";
import { getPublicPageUrl } from "@/lib/slugs";
import { getPublicPageBlocks, getPublicPageData } from "@/lib/public-page";
import { profilePageJsonLd, serializeJsonLd } from "@/lib/json-ld";
import { SITE_URL, absoluteUrl } from "@/lib/site";
import { isInIndexProbation } from "@/lib/indexing";
import { getTurnstileClientConfig } from "@/lib/turnstile";
import { countConfirmed } from "@/lib/subscribers";
import { getLimit, type PlanId } from "@/lib/entitlements";
import {
  detectInAppBrowser,
  escapeTargetUrl,
  newHandoffId,
  parseDisabledMethods,
  planInAppEscape,
} from "@/lib/in-app-browser";

interface Props {
  params: Promise<{ username: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

// Page data comes from the cached loaders in src/lib/public-page.ts (data-layer
// cache, tag-invalidated, dates revived after the JSON round trip). The in-app
// browser bar depends on the request's User-Agent, so it is decided in the
// page component, never inside those loaders. If a CDN cache is ever put in
// front of this route, it must Vary on User-Agent (or the detection must move
// to the client).

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const result = await getPublicPageData(username);

  // Also gate on isPublished: metadata used to be generated for draft pages,
  // exposing an unpublished title/bio on a route that 404s.
  if (!result || !result.page.isPublished) {
    return { title: "Not Found", robots: { index: false, follow: false } };
  }

  const { page, plan } = result;
  const title = page.seoTitle || page.title;
  const description =
    page.seoDescription || page.bio || `${page.title} — LinkNest`;
  const canonical = getPublicPageUrl(page.slug);

  // The owner's upload, or the generated card. `updatedAt` is a real Date on
  // both cache paths (src/lib/public-page.ts revives it), and it busts the
  // crawlers' cache of the generated card after an edit.
  const image = {
    url: page.ogImageUrl ?? `${canonical}/og?v=${page.updatedAt.getTime()}`,
    width: 1200,
    height: 630,
    alt: `${page.title} — LinkNest page`,
  };

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical },
    icons: { icon: page.faviconUrl ?? "/icon.svg" },
    openGraph: {
      title,
      description,
      type: "profile",
      url: canonical,
      siteName: "LinkNest",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    // New free pages are kept out of search for their first weeks (see
    // src/lib/indexing.ts). Evaluated per request, so it lifts on its own.
    ...(isInIndexProbation({ plan, firstPublishedAt: page.firstPublishedAt })
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}

export default async function PublicPage({ params, searchParams }: Props) {
  const { username } = await params;
  const result = await getPublicPageData(username);

  if (!result || !result.page.isPublished) {
    notFound();
  }

  const { page, plan } = result;
  const pageBlocks = await getPublicPageBlocks(page.id, page.slug);

  const theme = page.theme as Partial<ThemeTokens> | null;
  const isPro = plan === "pro";
  const showBadge = !(isPro && theme?.hideBranding);

  // Only pages with a sign-up form pay for the list-state query.
  const hasEmailForm = pageBlocks.some((b) => b.type === "email_capture");
  const runtime = hasEmailForm
    ? {
        turnstile: getTurnstileClientConfig(),
        listOpen:
          (await countConfirmed(db, page.workspaceId)) <
          getLimit(plan as PlanId, "max_subscribers"),
      }
    : undefined;

  // Meta in-app browsers (Instagram, Facebook, Messenger, Threads). Detection
  // feeds analytics whatever the owner chose; the toggle and the kill switch
  // only decide whether the escape bar is offered. A handoff id is issued only
  // with the bar, since only its links can carry one (src/lib/handoff.ts).
  const detected = detectInAppBrowser((await headers()).get("user-agent"));
  const disabled = parseDisabledMethods(process.env.INAPP_ESCAPE_DISABLED);
  const promptEnabled = detected !== null && !theme?.hideInAppBrowserPrompt && disabled !== "all";
  const handoffId = promptEnabled ? newHandoffId() : undefined;
  const inApp =
    detected && promptEnabled
      ? planInAppEscape(
          detected,
          escapeTargetUrl(SITE_URL, page.slug, await searchParams, detected.app, handoffId),
          {
            disabled,
            autoAttempt: process.env.INAPP_AUTO_ESCAPE_ANDROID === "1",
          },
        )
      : null;

  // Public route only: the editor and dashboard previews render PublicPageView
  // without it, so a draft never emits structured data.
  const jsonLd = profilePageJsonLd({
    page,
    blocks: pageBlocks,
    canonicalUrl: absoluteUrl(getPublicPageUrl(page.slug)),
    entityKind: page.entityKind === "organization" ? "organization" : "person",
  });

  return (
    <>
      <TemplateRenderer
        page={page}
        blocks={pageBlocks}
        showBadge={showBadge}
        showReport
        runtime={runtime}
        inApp={inApp ?? undefined}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <PageBeacon
        slug={page.slug}
        inApp={detected?.app}
        handoffId={inApp ? handoffId : undefined}
      />
    </>
  );
}
