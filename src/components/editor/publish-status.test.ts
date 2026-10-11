import { describe, expect, it } from "vitest";
import { publishStatus } from "./publish-status";

describe("publishStatus", () => {
  const idle = { unsaved: false, holding: false, pendingOps: 0, failed: false };

  it("is saved only when nothing at all is in flight", () => {
    expect(publishStatus(idle)).toBe("saved");
  });

  it("is saving for coordinator work, a delete hold, or a tracked action", () => {
    expect(publishStatus({ ...idle, unsaved: true })).toBe("saving");
    expect(publishStatus({ ...idle, holding: true })).toBe("saving");
    expect(publishStatus({ ...idle, pendingOps: 1 })).toBe("saving");
  });

  it("reports a failure over anything still saving", () => {
    expect(publishStatus({ ...idle, failed: true })).toBe("failed");
    expect(publishStatus({ unsaved: true, holding: true, pendingOps: 2, failed: true })).toBe("failed");
  });
});
