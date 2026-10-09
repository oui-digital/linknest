import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SaveCoordinator,
  SAVE_FAILED_MESSAGE,
  type SaveEntity,
  type SaveFn,
  type SaveOutcome,
} from "./save-coordinator";

const block: SaveEntity = { kind: "block", id: "b1" };
const page: SaveEntity = { kind: "page" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const ok = async (): Promise<SaveOutcome> => ({ ok: true });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("SaveCoordinator", () => {
  it("merges edits made within the debounce window into one request", async () => {
    const save = vi.fn<SaveFn>(ok);
    const c = new SaveCoordinator({ save, debounceMs: 500 });

    c.enqueue(block, { label: "a" });
    await vi.advanceTimersByTimeAsync(200);
    c.enqueue(block, { content: { text: "b" } });
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    expect(c.status(block)).toBe("pending");

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(block, { label: "a", content: { text: "b" } });
    expect(c.status(block)).toBe("idle");
    expect(c.hasUnsaved()).toBe(false);
  });

  it("keeps one request in flight per entity and sends later edits afterwards", async () => {
    const first = deferred<SaveOutcome>();
    const save = vi.fn<SaveFn>().mockReturnValueOnce(first.promise).mockImplementation(ok);
    const c = new SaveCoordinator({ save, debounceMs: 0 });

    c.enqueue(block, { label: "a" });
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);

    c.enqueue(block, { label: "b" });
    c.enqueue(block, { url: "https://x.example/" });
    await vi.advanceTimersByTimeAsync(50);
    expect(save).toHaveBeenCalledTimes(1); // still waiting on the first
    expect(c.status(block)).toBe("saving");

    first.resolve({ ok: true });
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(block, { label: "b", url: "https://x.example/" });
    expect(c.status(block)).toBe("idle");
  });

  // Regression: a failed request must not erase an edit queued behind it.
  it("keeps newer edits when an earlier request fails, and resends them together", async () => {
    const first = deferred<SaveOutcome>();
    const save = vi.fn<SaveFn>().mockReturnValueOnce(first.promise).mockImplementation(ok);
    const c = new SaveCoordinator({ save, debounceMs: 0 });

    c.enqueue(block, { url: "javascript:alert(1)" });
    await vi.advanceTimersByTimeAsync(0);
    c.enqueue(block, { content: { text: "typed while saving" } });

    first.resolve({ ok: false, error: "Invalid URL" });
    await vi.runAllTimersAsync();
    expect(c.status(block)).toBe("failed");
    expect(c.error(block)).toBe("Invalid URL");
    expect(c.hasFailed()).toBe(true);
    expect(save).toHaveBeenCalledTimes(1); // a refused patch is not resent on its own

    // Fixing the field sends everything that is still unsaved, as one request.
    c.enqueue(block, { url: "https://fine.example/" });
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(block, {
      url: "https://fine.example/",
      content: { text: "typed while saving" },
    });
    expect(c.status(block)).toBe("idle");
    expect(c.hasUnsaved()).toBe(false);
  });

  it("retries a failed entity on request with its full unsaved patch", async () => {
    const save = vi
      .fn<SaveFn>()
      .mockResolvedValueOnce({ ok: false, error: "Server hiccup" })
      .mockImplementation(ok);
    const c = new SaveCoordinator({ save, debounceMs: 0 });

    c.enqueue(block, { label: "a", content: { text: "b" } });
    await vi.runAllTimersAsync();
    expect(c.status(block)).toBe("failed");

    expect(await c.retry(block)).toEqual({ ok: true });
    expect(save).toHaveBeenLastCalledWith(block, { label: "a", content: { text: "b" } });
    expect(c.status(block)).toBe("idle");
  });

  // Regression: publishing must be refused while a save is rejected.
  it("reports failures from flushAll so publishing can refuse", async () => {
    const save = vi.fn<SaveFn>(async (_entity, patch) =>
      patch.label === "bad" ? { ok: false, error: "Label too long" } : { ok: true },
    );
    const c = new SaveCoordinator({ save, debounceMs: 500 });

    c.enqueue(block, { label: "bad" });
    c.enqueue(page, { title: "fine" });
    const result = await c.flushAll(); // sends both without waiting for the debounce

    expect(save).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: false, failed: [{ entity: block, error: "Label too long" }] });
    expect(c.hasFailed()).toBe(true);
    expect(c.status(page)).toBe("idle");

    // Still failed, still refused, until the patch is fixed or the server accepts it.
    expect((await c.flushAll()).ok).toBe(false);
    expect(save).toHaveBeenCalledTimes(3);
  });

  it("resolves flushAll only after the last in-flight request settles", async () => {
    const first = deferred<SaveOutcome>();
    const save = vi.fn<SaveFn>().mockReturnValueOnce(first.promise).mockImplementation(ok);
    const c = new SaveCoordinator({ save, debounceMs: 0 });

    c.enqueue(block, { label: "a" });
    await vi.advanceTimersByTimeAsync(0);
    c.enqueue(block, { label: "b" });

    let settled = false;
    const flushing = c.flushAll().then((r) => {
      settled = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(50);
    expect(settled).toBe(false);

    first.resolve({ ok: true });
    expect(await flushing).toEqual({ ok: true });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(block, { label: "b" });
    expect(c.hasUnsaved()).toBe(false);
  });

  it("sends immediate edits without waiting", async () => {
    const save = vi.fn<SaveFn>(ok);
    const c = new SaveCoordinator({ save, debounceMs: 500 });
    c.enqueue(block, { isVisible: false }, { immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledWith(block, { isVisible: false });
  });

  it("treats a throwing saver as a failed save", async () => {
    const save = vi.fn<SaveFn>(async () => {
      throw new Error("network");
    });
    const c = new SaveCoordinator({ save, debounceMs: 0 });
    c.enqueue(block, { label: "a" });
    await vi.runAllTimersAsync();
    expect(c.status(block)).toBe("failed");
    expect(c.error(block)).toBe(SAVE_FAILED_MESSAGE);
  });

  it("forgets a deleted block's unsaved work", async () => {
    const save = vi.fn<SaveFn>(ok);
    const c = new SaveCoordinator({ save, debounceMs: 500 });
    c.enqueue(block, { label: "a" });
    c.forget(block);
    await vi.runAllTimersAsync();
    expect(save).not.toHaveBeenCalled();
    expect(c.hasUnsaved()).toBe(false);
  });

  it("flushes pending work on dispose instead of dropping it", async () => {
    const save = vi.fn<SaveFn>(ok);
    const c = new SaveCoordinator({ save, debounceMs: 500 });
    c.enqueue(page, { bio: "typed, then navigated away" });
    c.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledWith(page, { bio: "typed, then navigated away" });
  });
});

describe("SaveCoordinator under concurrent edits", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // Regression: an entity first edited while flushAll() was running was not
  // in its snapshot, so the publish barrier passed with unsaved work.
  it("does not resolve flushAll while an entity edited during the flush is unsaved", async () => {
    const a: SaveEntity = { kind: "block", id: "a" };
    const b: SaveEntity = { kind: "block", id: "b" };
    const first = deferred<SaveOutcome>();
    const save = vi.fn<SaveFn>().mockReturnValueOnce(first.promise).mockImplementation(ok);
    const c = new SaveCoordinator({ save, debounceMs: 500 });

    c.enqueue(a, { label: "a" });
    const flushing = c.flushAll();
    await vi.advanceTimersByTimeAsync(0);
    c.enqueue(b, { label: "b" }); // never seen before the flush started
    first.resolve({ ok: true });

    expect(await flushing).toEqual({ ok: true });
    expect(save).toHaveBeenCalledWith(b, { label: "b" });
    expect(c.hasUnsaved()).toBe(false);
  });

  it("also picks up a new edit to an entity that had already drained", async () => {
    const a: SaveEntity = { kind: "block", id: "a" };
    const b: SaveEntity = { kind: "block", id: "b" };
    const slowB = deferred<SaveOutcome>();
    const save = vi.fn<SaveFn>(async (entity) => (entity === b ? slowB.promise : { ok: true }));
    const c = new SaveCoordinator({ save, debounceMs: 500 });

    c.enqueue(a, { label: "a1" });
    c.enqueue(b, { label: "b1" });
    const flushing = c.flushAll();
    await vi.advanceTimersByTimeAsync(0); // a done, b still in flight
    c.enqueue(a, { label: "a2" });
    slowB.resolve({ ok: true });

    expect(await flushing).toEqual({ ok: true });
    expect(save).toHaveBeenCalledWith(a, { label: "a2" });
  });

  it("holds suspended work and restores its failed state on resume", async () => {
    const a: SaveEntity = { kind: "block", id: "a" };
    const save = vi.fn<SaveFn>().mockResolvedValueOnce({ ok: false, error: "nope" }).mockImplementation(ok);
    const c = new SaveCoordinator({ save, debounceMs: 0 });

    c.enqueue(a, { label: "x" });
    await vi.runAllTimersAsync();
    expect(c.status(a)).toBe("failed");

    c.suspend(a);
    c.enqueue(a, { url: "https://y.example/" });
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(1); // nothing sent while suspended

    c.resume(a); // the delete was refused
    expect(c.status(a)).toBe("pending");
    expect(c.hasUnsaved()).toBe(true);
    expect(await c.retry(a)).toEqual({ ok: true });
    expect(save).toHaveBeenLastCalledWith(a, { label: "x", url: "https://y.example/" });
  });
});

describe("SaveCoordinator with a delete in flight", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // Regression (QA recheck): publishing while a delete was pending passed the
  // barrier; the delete was then refused, leaving an unsaved edit behind a
  // published page.
  it("does not let flushAll pass until a pending delete is answered", async () => {
    const a: SaveEntity = { kind: "block", id: "a" };
    // The server keeps refusing this value, as it would.
    const save = vi.fn<SaveFn>(async (_e, patch) =>
      patch.url === "javascript:x" ? { ok: false, error: "Invalid URL" } : { ok: true },
    );
    const c = new SaveCoordinator({ save, debounceMs: 0 });
    c.enqueue(a, { url: "javascript:x" });
    await vi.runAllTimersAsync();
    expect(c.status(a)).toBe("failed");

    const refused = deferred<boolean>();
    void c.holdWhile(a, refused.promise);
    let settled = false;
    const flushing = c.flushAll().then((r) => {
      settled = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(50);
    expect(settled).toBe(false); // waiting for the delete's answer

    refused.resolve(false); // the server refused the delete
    const result = await flushing;
    expect(result.ok).toBe(false); // the restored, still-failed edit blocks publishing
  });

  it("saves a restored pending edit before passing", async () => {
    const a: SaveEntity = { kind: "block", id: "a" };
    const save = vi.fn<SaveFn>(ok);
    const c = new SaveCoordinator({ save, debounceMs: 500 });
    c.enqueue(a, { label: "kept" });
    const refused = deferred<boolean>();
    void c.holdWhile(a, refused.promise);
    const flushing = c.flushAll();
    refused.resolve(false);
    expect(await flushing).toEqual({ ok: true });
    expect(save).toHaveBeenCalledWith(a, { label: "kept" });
  });

  it("drops the work once the delete is confirmed, and also waits for it", async () => {
    const a: SaveEntity = { kind: "block", id: "a" };
    const save = vi.fn<SaveFn>(ok);
    const c = new SaveCoordinator({ save, debounceMs: 500 });
    c.enqueue(a, { label: "gone" });
    const deleted = deferred<boolean>();
    void c.holdWhile(a, deleted.promise);
    expect(c.isHolding()).toBe(true);
    const flushing = c.flushAll();
    deleted.resolve(true);
    expect(await flushing).toEqual({ ok: true });
    expect(save).not.toHaveBeenCalled();
    expect(c.isHolding()).toBe(false);
  });
});
