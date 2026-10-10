// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import type { ReactNode } from "react";
import type { InAppEscape } from "@/lib/in-app-browser";
import { BlockRuntimeProvider, type BlockRuntime } from "./block-runtime";

const beacon = vi.hoisted(() => {
  const state = {
    sendBeacon: vi.fn(),
    resolve: () => {},
    promise: Promise.resolve(),
    reset() {
      state.promise = new Promise<void>((r) => (state.resolve = r));
    },
  };
  return state;
});
vi.mock("@/components/analytics/beacon", () => ({
  sendBeacon: beacon.sendBeacon,
  get pageviewQueued() {
    return beacon.promise;
  },
}));

import { AUTO_ESCAPE_WAIT_MS, FALLBACK_MS, OpenInBrowserBar } from "./open-in-browser-bar";

const PAGE_ID = "11111111-1111-4111-8111-111111111111";
const KEY = `ln-inapp:${PAGE_ID}`;
const URL_ = "https://linknest.click/@jordan?ln_h=instagram-0123456789abcdef";

const iosInstagram: InAppEscape = {
  app: "instagram",
  platform: "ios",
  url: URL_,
  attempts: [{ method: "ig_extbrowser", url: "instagram://extbrowser/?url=x", via: "href" }],
  autoAttempt: false,
};
const iosFacebook: InAppEscape = {
  app: "facebook",
  platform: "ios",
  url: URL_,
  attempts: [{ method: "x_safari", url: "x-safari-https://linknest.click/@jordan", via: "open" }],
  autoAttempt: false,
};
const android: InAppEscape = {
  app: "instagram",
  platform: "android",
  url: URL_,
  attempts: [{ method: "intent", url: "intent://linknest.click/@jordan#Intent;scheme=https;end", via: "href" }],
  autoAttempt: true,
};

function wrap(children: ReactNode, mode: BlockRuntime["mode"] = "public") {
  return (
    <BlockRuntimeProvider value={{ mode, pageId: PAGE_ID, pageTitle: "Jordan" }}>
      {children}
    </BlockRuntimeProvider>
  );
}

function setup(escape: InAppEscape, opts: { mode?: BlockRuntime["mode"]; openWindow?: () => Window | null } = {}) {
  const navigate = vi.fn();
  const openWindow = vi.fn(opts.openWindow ?? (() => ({}) as Window));
  const utils = render(
    wrap(
      <OpenInBrowserBar escape={escape} slug="jordan" navigate={navigate} openWindow={openWindow} />,
      opts.mode,
    ),
  );
  return { ...utils, navigate, openWindow, action: () => screen.getByRole("link") };
}

const events = (outcome: string) =>
  beacon.sendBeacon.mock.calls.filter(([body]) => body.outcome === outcome).map(([body]) => body);

/** Storage that reads empty and refuses writes (private mode, blocked site data). */
function blockStorage() {
  const realStorage = window.sessionStorage;
  const blocked = {
    getItem: () => null,
    setItem: vi.fn(() => {
      throw new Error("blocked");
    }),
  };
  Object.defineProperty(window, "sessionStorage", { configurable: true, value: blocked });
  restoreStorage = () =>
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: realStorage });
  return blocked;
}
let restoreStorage = () => {};

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  sessionStorage.clear();
  beacon.sendBeacon.mockReset();
  beacon.reset();
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  // jsdom does not implement navigation; anchors to custom schemes just log.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  restoreStorage();
  restoreStorage = () => {};
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("OpenInBrowserBar", () => {
  it("hydrates without a mismatch and then applies a stored dismissal", async () => {
    const tree = wrap(<OpenInBrowserBar escape={iosInstagram} slug="jordan" />);
    const container = document.createElement("div");
    container.innerHTML = renderToString(tree);
    document.body.appendChild(container);
    expect(container.querySelector('[role="region"]')).not.toBeNull();

    sessionStorage.setItem(KEY, "1");
    const consoleError = vi.mocked(console.error);
    consoleError.mockClear();
    const recoverable = vi.fn();
    await act(async () => {
      hydrateRoot(container, tree, { onRecoverableError: recoverable });
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(container.querySelector('[role="region"]')).toBeNull();
    container.remove();
  });

  it("persists a dismissal on the public page only, and survives blocked storage", () => {
    const { unmount } = setup(iosInstagram);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("region")).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBe("1");
    unmount();

    sessionStorage.clear();
    const preview = setup(iosInstagram, { mode: "preview" });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(sessionStorage.getItem(KEY)).toBeNull();
    preview.unmount();

    const blocked = blockStorage();
    setup(iosInstagram);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(blocked.setItem).toHaveBeenCalled();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("lets an href escape navigate, then shows instructions after the fallback delay", () => {
    vi.useFakeTimers();
    const { action } = setup(iosInstagram);
    expect(action().getAttribute("href")).toBe("instagram://extbrowser/?url=x");
    expect(action().hasAttribute("target")).toBe(false);
    expect(action().hasAttribute("data-link-id")).toBe(false);

    const notPrevented = fireEvent.click(action());
    expect(notPrevented).toBe(true);
    expect(events("attempt")).toEqual([
      expect.objectContaining({ event: "inapp_escape", inApp: "instagram", platform: "ios", method: "ig_extbrowser" }),
    ]);
    expect(action().getAttribute("aria-disabled")).toBe("true");

    act(() => vi.advanceTimersByTime(FALLBACK_MS - 1));
    expect(screen.queryByText(/Still here\?/)).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText(/Still here\? Open this page from Instagram’s menu/)).toBeTruthy();
    expect(events("instructions_shown")).toHaveLength(1);
    expect(action().textContent).toBe("Try again");
  });

  it("swallows taps while an attempt is pending", () => {
    vi.useFakeTimers();
    const { action, navigate, openWindow } = setup(iosFacebook);
    fireEvent.click(action());
    expect(openWindow).toHaveBeenCalledTimes(1);

    const notPrevented = fireEvent.click(action());
    expect(notPrevented).toBe(false); // default navigation blocked
    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    expect(events("attempt")).toHaveLength(1);

    // Only one timer: a single instructions event.
    act(() => vi.advanceTimersByTime(FALLBACK_MS * 3));
    expect(events("instructions_shown")).toHaveLength(1);
  });

  it("opens x-safari through window.open, falling back to navigation", () => {
    const opened = setup(iosFacebook);
    expect(fireEvent.click(opened.action())).toBe(false);
    expect(opened.openWindow).toHaveBeenCalledWith("x-safari-https://linknest.click/@jordan");
    expect(opened.navigate).not.toHaveBeenCalled();
    opened.unmount();

    const blocked = setup(iosFacebook, { openWindow: () => null });
    fireEvent.click(blocked.action());
    expect(blocked.navigate).toHaveBeenCalledWith("x-safari-https://linknest.click/@jordan");
  });

  it("suspends the fallback while hidden and shows instructions on return", () => {
    vi.useFakeTimers();
    const { action } = setup(iosInstagram);
    fireEvent.click(action());
    act(() => setVisibility("hidden"));
    act(() => vi.advanceTimersByTime(FALLBACK_MS * 10));
    expect(screen.queryByText(/Still here\?/)).toBeNull();

    act(() => setVisibility("visible"));
    expect(screen.getByText(/Still here\?/)).toBeTruthy();
    expect(events("instructions_shown")).toHaveLength(1);
  });

  it("shows instructions when the page is restored (pageshow)", () => {
    const { action } = setup(iosInstagram);
    fireEvent.click(action());
    act(() => {
      window.dispatchEvent(new Event("pageshow"));
    });
    expect(screen.getByText(/Still here\?/)).toBeTruthy();
  });

  it("copies the link, or reveals it when the clipboard rejects or is missing", async () => {
    const empty = { ...iosInstagram, attempts: [] };

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const a = setup(empty);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy link" })));
    expect(writeText).toHaveBeenCalledWith(URL_);
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(events("copied")).toHaveLength(1);
    a.unmount();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")) },
    });
    const b = setup(empty);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy link" })));
    expect((screen.getByRole("textbox", { name: "Page link" }) as HTMLInputElement).value).toBe(URL_);
    b.unmount();

    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    setup(empty);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy link" })));
    expect(screen.getByRole("textbox", { name: "Page link" })).toBeTruthy();
  });

  it("starts with instructions and no retry when every method is disabled", () => {
    setup({ ...iosInstagram, attempts: [] });
    expect(screen.getByText(/Still here\?/)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("sends no analytics from the editor preview", () => {
    const { action } = setup(iosInstagram, { mode: "preview" });
    fireEvent.click(action());
    expect(beacon.sendBeacon).not.toHaveBeenCalled();
  });
});

describe("automatic Android attempt", () => {
  it("waits for the page view to be queued, then navigates once", async () => {
    const { navigate } = setup(android);
    await act(async () => {});
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => beacon.resolve());
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(android.attempts[0]!.url);
    expect(sessionStorage.getItem(`${KEY}:auto`)).toBe("1");
    expect(events("attempt")).toHaveLength(1);
  });

  it("proceeds after the cap when the page view never queues", async () => {
    vi.useFakeTimers();
    const { navigate } = setup(android);
    await act(async () => vi.advanceTimersByTime(AUTO_ESCAPE_WAIT_MS - 1));
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("re-reads a stored dismissal instead of trusting the hydrated value", async () => {
    sessionStorage.setItem(KEY, "1");
    const { navigate } = setup(android);
    await act(async () => beacon.resolve());
    expect(navigate).not.toHaveBeenCalled();
  });

  it("runs once per session", async () => {
    sessionStorage.setItem(`${KEY}:auto`, "1");
    const { navigate } = setup(android);
    await act(async () => beacon.resolve());
    expect(navigate).not.toHaveBeenCalled();
  });

  it("skips when the once-flag cannot be stored", async () => {
    const blocked = blockStorage();
    const { navigate } = setup(android);
    await act(async () => beacon.resolve());
    expect(blocked.setItem).toHaveBeenCalledWith(`${KEY}:auto`, "1");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("never runs unless enabled, nor in the editor preview", async () => {
    const off = setup({ ...android, autoAttempt: false });
    await act(async () => beacon.resolve());
    expect(off.navigate).not.toHaveBeenCalled();
    off.unmount();

    beacon.reset();
    const preview = setup(android, { mode: "preview" });
    await act(async () => beacon.resolve());
    expect(preview.navigate).not.toHaveBeenCalled();
  });
});
