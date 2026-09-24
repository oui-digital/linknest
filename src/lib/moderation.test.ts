import { describe, it, expect } from "vitest";
import { isBlockedByModeration } from "./moderation";

/**
 * Admin takedowns must survive the owner clicking Publish. Previously an
 * admin_manual unpublish was undone by a single republish, because the publish
 * path only consulted Safe Browsing.
 */
describe("isBlockedByModeration", () => {
  it("allows publishing when the page has no takedown history", () => {
    expect(isBlockedByModeration(null)).toBe(false);
    expect(isBlockedByModeration(undefined)).toBe(false);
  });

  it("blocks publishing after an admin takedown", () => {
    expect(
      isBlockedByModeration({ action: "unpublished", source: "admin_manual" }),
    ).toBe(true);
  });

  it("allows publishing once the page is reinstated", () => {
    expect(
      isBlockedByModeration({ action: "reinstated", source: "admin_manual" }),
    ).toBe(false);
  });

  it("does not block automated unpublishes the owner can fix themselves", () => {
    // Plan downgrades and flagged links tell the owner how to re-publish.
    for (const source of ["cron_reconcile", "cron_rescan"]) {
      expect(isBlockedByModeration({ action: "unpublished", source })).toBe(
        false,
      );
    }
  });
});
