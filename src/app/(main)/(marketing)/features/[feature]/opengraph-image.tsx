import { notFound } from "next/navigation";
import { FEATURES, FEATURE_LIST, type FeatureSlug } from "@/lib/marketing/feature-content";
import { marketingSocialImage, SOCIAL_IMAGE_SIZE } from "@/lib/marketing/social-image";

export const runtime = "nodejs";
export const size = SOCIAL_IMAGE_SIZE;
export const contentType = "image/png";
export const alt = "LinkNest feature page";
export const dynamicParams = false;
export function generateStaticParams() { return FEATURE_LIST.map(({ slug }) => ({ feature: slug })); }
export default async function Image({ params }: { params: Promise<{ feature: string }> }) {
  const { feature } = await params;
  if (!(feature in FEATURES)) notFound();
  const content = FEATURES[feature as FeatureSlug];
  return marketingSocialImage(content.title, content.label);
}
