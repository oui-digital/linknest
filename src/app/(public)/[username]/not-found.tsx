import { NotFoundView } from "@/components/route-fallbacks";

/** An unknown or unpublished handle: rendered inside the public root layout. */
export default function PublicPageNotFound() {
  return <NotFoundView />;
}
