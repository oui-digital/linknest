/**
 * Search-indexing probation for new free pages.
 *
 * A page published five minutes ago used to be in the sitemap within the hour
 * and indexable immediately, which is exactly what churn-and-burn SEO spam
 * needs: publish, get crawled, get taken down, repeat. Free pages now stay out
 * of the sitemap and carry `noindex` for their first INDEX_PROBATION_DAYS after
 * first publication. The page still renders and can be shared; it just does not
 * pass through search until it has been live for a while — long enough for
 * reports and moderation to catch a spam page first.
 *
 * Pro pages skip probation: a Stripe identity is on file, and paying customers
 * expect their page to be findable.
 */
export const INDEX_PROBATION_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isInIndexProbation({
  plan,
  firstPublishedAt,
  now = new Date(),
}: {
  plan: string;
  // A string when the page row came through unstable_cache, which serializes
  // to JSON and hands Dates back as ISO strings on a cache hit.
  firstPublishedAt: Date | string | null;
  now?: Date;
}): boolean {
  if (plan === "pro") return false;
  // Never published (or published before the column existed and not yet
  // backfilled): treat as brand new rather than as old.
  if (!firstPublishedAt) return true;
  const firstPublished = new Date(firstPublishedAt).getTime();
  // An unparseable value must not read as "old enough to index".
  if (Number.isNaN(firstPublished)) return true;
  return firstPublished > indexProbationCutoff(now).getTime();
}

/** Pages first published before this instant are out of probation. */
export function indexProbationCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - INDEX_PROBATION_DAYS * DAY_MS);
}
