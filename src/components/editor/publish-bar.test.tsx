// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublishBar } from "./publish-bar";
import { SaveCoordinator, type SaveOutcome } from "./save-coordinator";
import { PendingOps } from "./pending-ops";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/actions/page", () => ({ publishPage: vi.fn(), unpublishPage: vi.fn() }));
vi.mock("./share-modal", () => ({ ShareModal: () => null }));

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

const page = {
  id: "p1",
  slug: "demo",
  isPublished: true,
} as unknown as Parameters<typeof PublishBar>[0]["page"];

function setup(saver?: () => Promise<SaveOutcome>) {
  let rerender = () => {};
  const saves = new SaveCoordinator({
    save: saver ?? (async () => ({ ok: true })),
    onChange: () => rerender(),
    debounceMs: 0,
  });
  const ops = new PendingOps(() => rerender());
  const view = render(
    <PublishBar page={page} saves={saves} ops={ops} onPageChange={() => {}} onError={() => {}} />,
  );
  rerender = () =>
    view.rerender(
      <PublishBar page={page} saves={saves} ops={ops} onPageChange={() => {}} onError={() => {}} />,
    );
  return { saves, ops };
}

const status = () => screen.getByRole("status").textContent;

describe("PublishBar on a live page", () => {
  it("shows no Update button and reads Saved when idle", () => {
    setup();
    expect(screen.queryByRole("button", { name: /^(update|publish)$/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeTruthy();
    expect(status()).toBe("Live · Saved");
  });

  it("reads Saving while a coordinator save is out, then Saved", async () => {
    const save = deferred<SaveOutcome>();
    const { saves } = setup(() => save.promise);

    await act(async () => {
      saves.enqueue({ kind: "page" }, { title: "x" }, { immediate: true });
      await Promise.resolve();
    });
    expect(status()).toBe("Live · Saving…");

    await act(async () => {
      save.resolve({ ok: true });
      await saves.flushAll();
    });
    expect(status()).toBe("Live · Saved");
  });

  it("reads Changes not saved after a tracked action is refused", async () => {
    const { ops } = setup();
    await act(async () => {
      await ops.track(Promise.resolve({ error: "Premium templates require a Pro plan" }));
    });
    expect(status()).toBe("Live · Changes not saved");
  });

  it("stays at Saving while a delete is held, until the hold resolves", async () => {
    const { saves } = setup();
    const removed = deferred<boolean>();

    let held!: Promise<void>;
    await act(async () => {
      held = saves.holdWhile({ kind: "block", id: "b1" }, removed.promise);
      await Promise.resolve();
    });
    expect(status()).toBe("Live · Saving…");

    await act(async () => {
      removed.resolve(true);
      await held;
    });
    expect(status()).toBe("Live · Saved");
  });

  it("reads Saving while a tracked action is open", async () => {
    const { ops } = setup();
    const op = deferred<{ success: true }>();
    let tracked!: Promise<unknown>;
    await act(async () => {
      tracked = ops.track(op.promise);
      await Promise.resolve();
    });
    expect(status()).toBe("Live · Saving…");
    await act(async () => {
      op.resolve({ success: true });
      await tracked;
    });
    expect(status()).toBe("Live · Saved");
  });
});

describe("PublishBar on a draft", () => {
  it("still offers Publish", () => {
    const saves = new SaveCoordinator({ save: async () => ({ ok: true }) });
    render(
      <PublishBar
        page={{ ...page, isPublished: false } as typeof page}
        saves={saves}
        ops={new PendingOps()}
        onPageChange={() => {}}
        onError={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Publish" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
