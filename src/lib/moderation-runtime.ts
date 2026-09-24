import { revalidateTag } from "next/cache";
import { publicPageTag } from "@/lib/cache-tags";
import type { ModerationDeps } from "@/lib/moderation-actions";

/**
 * Production wiring for moderation. `{ expire: 0 }` expires the cached page
 * immediately; "max" (used for owner edits) serves stale content while it
 * refreshes, which would leave a taken-down page visible.
 */
export const moderationDeps: ModerationDeps = {
  revalidate: (slug) => revalidateTag(publicPageTag(slug), { expire: 0 }),
};
