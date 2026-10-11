import { describe, expect, it, vi } from "vitest";
import { PendingOps } from "./pending-ops";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("PendingOps", () => {
  it("counts an operation while it is open and notifies on both edges", async () => {
    const onChange = vi.fn();
    const ops = new PendingOps(onChange);
    const op = deferred<{ ok: true }>();

    const tracked = ops.track(op.promise);
    expect(ops.pending).toBe(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    op.resolve({ ok: true });
    await expect(tracked).resolves.toEqual({ ok: true });
    expect(ops.pending).toBe(0);
    expect(ops.failed).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("marks a refusal returned as { error } and a rejection as failed", async () => {
    const ops = new PendingOps();
    await ops.track(Promise.resolve({ error: "Nope" }));
    expect(ops.failed).toBe(true);

    ops.clearFailed();
    expect(ops.failed).toBe(false);

    await expect(ops.track(Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(ops.failed).toBe(true);
    expect(ops.pending).toBe(0);
  });

  it("clears the failure once a later operation succeeds", async () => {
    const ops = new PendingOps();
    await ops.track(Promise.resolve({ error: "Nope" }));
    await ops.track(Promise.resolve({ success: true }));
    expect(ops.failed).toBe(false);
  });

  it("counts overlapping operations separately", async () => {
    const ops = new PendingOps();
    const a = deferred<void>();
    const b = deferred<void>();
    const ta = ops.track(a.promise);
    const tb = ops.track(b.promise);
    expect(ops.pending).toBe(2);
    a.resolve();
    await ta;
    expect(ops.pending).toBe(1);
    b.resolve();
    await tb;
    expect(ops.pending).toBe(0);
  });
});
