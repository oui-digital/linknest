/**
 * What the publish bar says about a live page.
 *
 * A live page has no "Update" step: every saved edit is already on the page.
 * The bar used to show an Update button that re-ran publish and changed
 * nothing visible. It now states the truth, from every write path at once: the
 * coordinator's queues, a delete in flight (a hold), and the direct server
 * actions tracked by PendingOps.
 */
export type PublishStatus = "saved" | "saving" | "failed";

export function publishStatus({
  unsaved,
  holding,
  pendingOps,
  failed,
}: {
  unsaved: boolean;
  holding: boolean;
  pendingOps: number;
  failed: boolean;
}): PublishStatus {
  if (failed) return "failed";
  if (unsaved || holding || pendingOps > 0) return "saving";
  return "saved";
}

// No counts: the coordinator counts entities, not edits, so "2 changes" would
// be wrong as often as right.
export const PUBLISH_STATUS_LABEL: Record<PublishStatus, string> = {
  saved: "Live · Saved",
  saving: "Live · Saving…",
  failed: "Live · Changes not saved",
};
