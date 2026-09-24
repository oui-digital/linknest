import { describe, it, expect } from "vitest";
import {
  activeHolds,
  currentReviewEpoch,
  isBlockedByModeration,
  moderationBlockMessage,
  MODERATION_BLOCKED_ERROR,
  REPORTS_BLOCKED_ERROR,
  type ModerationEntry,
} from "./moderation";

let seq = 0;
const at = (entry: Omit<ModerationEntry, "seq">, s = ++seq): ModerationEntry => ({ ...entry, seq: s });
const takedown = (reasonCode: string, source = "admin_manual") =>
  at({ action: "unpublished", source, reasonCode });
const reinstate = (reasonCode: string) =>
  at({ action: "reinstated", source: "admin_manual", reasonCode });

/**
 * Admin takedowns must survive the owner clicking Publish. Previously an
 * admin_manual unpublish was undone by a single republish, because the publish
 * path only consulted Safe Browsing.
 */
describe("isBlockedByModeration", () => {
  it("allows publishing when the page has no takedown history", () => {
    expect(isBlockedByModeration([])).toBe(false);
  });

  it("blocks publishing after an admin takedown", () => {
    expect(isBlockedByModeration([takedown("manual_review")])).toBe(true);
  });

  it("blocks publishing after a report-threshold takedown", () => {
    expect(isBlockedByModeration([takedown("user_reports", "report_threshold")])).toBe(true);
  });

  it("allows publishing once the page is reinstated", () => {
    expect(isBlockedByModeration([takedown("manual_review"), reinstate("manual_review")])).toBe(false);
  });

  it("does not block automated unpublishes the owner can fix themselves", () => {
    // Plan downgrades and flagged links tell the owner how to re-publish.
    for (const source of ["cron_reconcile", "cron_rescan"]) {
      expect(isBlockedByModeration([takedown("plan_downgraded", source)])).toBe(false);
    }
  });

  it("ignores warnings", () => {
    expect(
      isBlockedByModeration([at({ action: "warning", source: "publish_signal", reasonCode: "link_farm_suspect" })]),
    ).toBe(false);
  });
});

describe("activeHolds", () => {
  it("keeps a manual ban when only the account suspension is lifted", () => {
    const holds = activeHolds([
      takedown("manual_review"),
      takedown("account_suspended"),
      reinstate("account_suspended"),
    ]);
    expect([...holds]).toEqual(["manual_review"]);
  });

  it("clears every hold with an 'all' reinstatement", () => {
    expect(
      activeHolds([takedown("manual_review"), takedown("account_suspended"), reinstate("all")]).size,
    ).toBe(0);
  });

  it("does not let a reinstatement for another reason clear a hold", () => {
    expect([...activeHolds([takedown("manual_review"), reinstate("user_reports")])]).toEqual([
      "manual_review",
    ]);
  });

  it("folds by seq, not by the order rows were returned", () => {
    const t = at({ action: "unpublished", source: "admin_manual", reasonCode: "manual_review" }, 10);
    const r = at({ action: "reinstated", source: "admin_manual", reasonCode: "manual_review" }, 5);
    // Reinstated first (seq 5), then taken down (seq 10): still blocked.
    expect(isBlockedByModeration([t, r])).toBe(true);
  });

  it("lets a later takedown re-establish a cleared hold", () => {
    expect(
      isBlockedByModeration([takedown("manual_review"), reinstate("all"), takedown("manual_review")]),
    ).toBe(true);
  });
});

describe("moderationBlockMessage", () => {
  it("tells the owner a reported page is pending review", () => {
    expect(moderationBlockMessage(new Set(["user_reports"]))).toBe(REPORTS_BLOCKED_ERROR);
  });

  it("uses the Terms of Service message for any other hold", () => {
    expect(moderationBlockMessage(new Set(["manual_review"]))).toBe(MODERATION_BLOCKED_ERROR);
    expect(moderationBlockMessage(new Set(["user_reports", "manual_review"]))).toBe(
      MODERATION_BLOCKED_ERROR,
    );
  });
});

describe("currentReviewEpoch", () => {
  it("is 0 before any reinstatement", () => {
    expect(currentReviewEpoch([takedown("user_reports", "report_threshold")])).toBe(0);
  });

  it("is the seq of the latest reinstatement", () => {
    const r1 = reinstate("all");
    const r2 = reinstate("user_reports");
    expect(currentReviewEpoch([r2, takedown("manual_review"), r1])).toBe(r2.seq);
  });
});
