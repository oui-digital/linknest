/**
 * Moderation rules shared by publish, reports and the admin API.
 *
 * Moderation state is a set of independent HOLDS folded from
 * page_moderation_log in `seq` order. A blocking `unpublished` row adds a hold
 * named by its reason_code; a `reinstated` row clears the hold with the same
 * reason_code, or every hold when its reason_code is "all". A page can be
 * published only while it has no holds.
 *
 * Holds are independent on purpose. Deciding from the newest row alone meant
 * that a page banned by hand and then caught up in an account suspension
 * became publishable again as soon as the account was reinstated.
 *
 * Automated unpublishes (plan downgrade, flagged link) are not holds: they tell
 * the owner how to fix the page and republish.
 */

export const ADMIN_TAKEDOWN_SOURCE = "admin_manual";
export const REPORT_TAKEDOWN_SOURCE = "report_threshold";

/** Sources whose `unpublished` rows block republishing until reinstated. */
export const BLOCKING_SOURCES: readonly string[] = [
  ADMIN_TAKEDOWN_SOURCE,
  REPORT_TAKEDOWN_SOURCE,
];

/** Hold reasons the admin API can place and clear. */
export const HOLD_REASONS = [
  "manual_review",
  "account_suspended",
  "user_reports",
] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];
export const REINSTATE_ALL = "all";

export const MODERATION_BLOCKED_ERROR =
  "This page was unpublished by LinkNest for violating our Terms of Service and can't be republished. Contact support@linknest.click if you think this is a mistake.";

export const REPORTS_BLOCKED_ERROR =
  "This page was unpublished after multiple reports and is pending review. Contact support@linknest.click if you think this is a mistake.";

export type ModerationEntry = {
  seq: number;
  action: string;
  source: string;
  reasonCode: string;
};

/** The holds currently on a page, from its moderation log. */
export function activeHolds(entries: readonly ModerationEntry[]): Set<string> {
  const holds = new Set<string>();
  for (const entry of [...entries].sort((a, b) => a.seq - b.seq)) {
    if (entry.action === "unpublished" && BLOCKING_SOURCES.includes(entry.source)) {
      holds.add(entry.reasonCode);
    } else if (entry.action === "reinstated") {
      if (entry.reasonCode === REINSTATE_ALL) holds.clear();
      else holds.delete(entry.reasonCode);
    }
  }
  return holds;
}

export function isBlockedByModeration(entries: readonly ModerationEntry[]): boolean {
  return activeHolds(entries).size > 0;
}

/**
 * The message shown when the owner tries to publish. Reports get their own
 * wording (the page is under review, not judged); any other hold, including a
 * report hold combined with something else, gets the Terms of Service one.
 */
export function moderationBlockMessage(holds: ReadonlySet<string>): string {
  const onlyReports = holds.size > 0 && [...holds].every((h) => h === "user_reports");
  return onlyReports ? REPORTS_BLOCKED_ERROR : MODERATION_BLOCKED_ERROR;
}

/**
 * The review epoch a report belongs to: the seq of the page's latest
 * reinstatement, or 0 if it was never reinstated. Reports are counted and
 * deduplicated within an epoch, so reports reviewed before a reinstatement
 * never count toward a new takedown.
 */
export function currentReviewEpoch(entries: readonly ModerationEntry[]): number {
  let epoch = 0;
  for (const entry of entries) {
    if (entry.action === "reinstated" && entry.seq > epoch) epoch = entry.seq;
  }
  return epoch;
}

/** Distinct reporters (abuse keys) in one epoch and 24 hours before a takedown. */
export const REPORT_TAKEDOWN_THRESHOLD = 3;

/**
 * Whether reports alone take a page down. Behind MODERATION_AUTO_TAKEDOWN so
 * it is switched on only after admin reinstatement and alerts have been
 * exercised in production. Pro pages are never taken down automatically —
 * three reporters are cheap for a competitor; they alert instead.
 */
export function shouldAutoTakedown({
  enabled,
  isPublished,
  plan,
  distinctReporters,
}: {
  enabled: boolean;
  isPublished: boolean;
  plan: string;
  distinctReporters: number;
}): boolean {
  return (
    enabled &&
    isPublished &&
    plan !== "pro" &&
    distinctReporters >= REPORT_TAKEDOWN_THRESHOLD
  );
}
