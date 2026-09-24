/**
 * Moderation rules shared by the publish path.
 *
 * An admin takedown writes an `unpublished` row with source `admin_manual` to
 * page_moderation_log. Without a check at publish time that takedown lasted
 * only until the owner clicked Publish again — publishPage only runs Safe
 * Browsing, which does not flag ToS violations such as gambling pages.
 *
 * A takedown is lifted by logging a `reinstated` row for the page.
 */

export const ADMIN_TAKEDOWN_SOURCE = "admin_manual";

export const MODERATION_BLOCKED_ERROR =
  "This page was unpublished by LinkNest for violating our Terms of Service and can't be republished. Contact support@linknest.click if you think this is a mistake.";

export type ModerationEntry = {
  action: string;
  source: string;
};

/**
 * Given the page's most recent takedown-or-reinstatement entry (or none),
 * decide whether publishing is blocked.
 */
export function isBlockedByModeration(
  latest: ModerationEntry | null | undefined,
): boolean {
  if (!latest) return false;
  return (
    latest.action === "unpublished" && latest.source === ADMIN_TAKEDOWN_SOURCE
  );
}
