import { getPublicPageData } from "@/lib/public-page";
import { renderOgCard } from "@/lib/og-card";

/**
 * The generated social card, at /@slug/og (the middleware rewrites /@slug/…
 * to /slug/…). generateMetadata points og:image here unless the owner
 * uploaded their own image, and adds ?v=<updatedAt> so crawlers refetch after
 * an edit.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const data = await getPublicPageData(username);
  if (!data || !data.page.isPublished) {
    return new Response("Not found", { status: 404 });
  }

  const image = await renderOgCard(data.page);
  image.headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
  return image;
}
