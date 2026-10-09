import { describe, expect, it, vi } from "vitest";
import { recheckSuspension, SUSPENSION_RECHECK_MS } from "./session-suspension";

const NOW = 1_800_000_000_000;
const stale = { id: "user-1", suspensionCheckedAt: NOW - SUSPENSION_RECHECK_MS - 1 };

describe("recheckSuspension", () => {
  it("skips the database on the edge runtime, where the driver cannot connect", async () => {
    const isSuspended = vi.fn();
    const result = await recheckSuspension(stale, { isSuspended, now: NOW, runtime: "edge" });
    expect(result).toBe(stale);
    expect(isSuspended).not.toHaveBeenCalled();
  });

  it("does not query again within the recheck window", async () => {
    const isSuspended = vi.fn();
    const fresh = { id: "user-1", suspensionCheckedAt: NOW - 1000 };
    expect(await recheckSuspension(fresh, { isSuspended, now: NOW, runtime: "nodejs" })).toBe(fresh);
    expect(isSuspended).not.toHaveBeenCalled();
  });

  it("stamps the check time when the account is active", async () => {
    const isSuspended = vi.fn().mockResolvedValue(false);
    const result = await recheckSuspension(stale, { isSuspended, now: NOW, runtime: "nodejs" });
    expect(isSuspended).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({ id: "user-1", suspensionCheckedAt: NOW });
  });

  it("ends the session of a suspended account", async () => {
    const isSuspended = vi.fn().mockResolvedValue(true);
    expect(await recheckSuspension(stale, { isSuspended, now: NOW, runtime: "nodejs" })).toBeNull();
  });

  it("keeps the session and retries next time when the lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const isSuspended = vi.fn().mockRejectedValue(new Error("Failed query"));
    const result = await recheckSuspension(stale, { isSuspended, now: NOW, runtime: "nodejs" });
    expect(result).toBe(stale);
  });

  it("checks a token that has never been stamped", async () => {
    const isSuspended = vi.fn().mockResolvedValue(false);
    await recheckSuspension({ id: "user-1" }, { isSuspended, now: NOW, runtime: "nodejs" });
    expect(isSuspended).toHaveBeenCalledOnce();
  });
});
