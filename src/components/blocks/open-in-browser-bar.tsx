"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  escapeInstructions,
  inAppLabel,
  type EscapeMethod,
  type InAppEscape,
} from "@/lib/in-app-browser";
import { pageviewQueued, sendBeacon } from "@/components/analytics/beacon";
import { useBlockRuntime } from "./block-runtime";

/** No hand-off within this long while visible: show the manual instructions. */
export const FALLBACK_MS = 1500;
/** Longest the automatic Android attempt waits for the page view to be queued. */
export const AUTO_ESCAPE_WAIT_MS = 1000;

type Phase = "prompt" | "pending" | "instructions";

const noopSubscribe = () => () => {};

function readFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string): boolean {
  try {
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}

const defaultNavigate = (url: string) => {
  window.location.href = url;
};
const defaultOpenWindow = (url: string) => window.open(url, "_blank");

/**
 * "Open in browser" bar for visitors inside a Meta in-app browser (Instagram,
 * Facebook, Messenger, Threads). The server decides whether it renders at all
 * (src/lib/in-app-browser.ts); everything here is best effort, because Meta
 * can disable any escape scheme in an app update.
 *
 * Lifecycle: prompt → pending (an escape was attempted) → instructions. A
 * hidden page proves nothing (leaving for Safari and switching apps look the
 * same), so while pending the timer is suspended when the page is hidden and
 * the instructions appear as soon as it is visible again. Taps while pending
 * are swallowed so the browser is never launched twice.
 *
 * Static, not sticky: the owner's announcement banner below it is sticky, and
 * two sticky bars at top-0 would overlap.
 */
export function OpenInBrowserBar({
  escape,
  slug,
  navigate = defaultNavigate,
  openWindow = defaultOpenWindow,
}: {
  escape: InAppEscape;
  slug: string;
  /** Injectable for tests. */
  navigate?: (url: string) => void;
  openWindow?: (url: string) => Window | null;
}) {
  const { mode, pageId, cta } = useBlockRuntime();
  const key = `ln-inapp:${pageId}`;
  const primary = escape.attempts[0];

  // Server snapshot is always "not dismissed", so hydration matches; the
  // stored dismissal applies right after.
  const stored = useSyncExternalStore(
    noopSubscribe,
    () => mode === "public" && readFlag(key),
    () => false,
  );
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<Phase>(primary ? "prompt" : "instructions");
  const [copy, setCopy] = useState<"idle" | "copied" | "manual">("idle");
  const manualRef = useRef<HTMLInputElement>(null);

  // The attempt in flight. A ref, not state: visibility listeners and timers
  // must see the current attempt without re-subscribing.
  const pending = useRef<{ method: EscapeMethod; timer?: ReturnType<typeof setTimeout> } | null>(
    null,
  );

  const track = useCallback(
    (outcome: "attempt" | "instructions_shown" | "copied", method?: EscapeMethod) => {
      if (mode !== "public") return;
      sendBeacon({
        event: "inapp_escape",
        slug,
        inApp: escape.app,
        platform: escape.platform,
        ...(method ? { method } : {}),
        outcome,
      });
    },
    [mode, slug, escape.app, escape.platform],
  );

  const showInstructions = useCallback(() => {
    const attempt = pending.current;
    if (!attempt) return;
    clearTimeout(attempt.timer);
    pending.current = null;
    track("instructions_shown", attempt.method);
    setPhase("instructions");
  }, [track]);

  const arm = useCallback(
    (method: EscapeMethod) => {
      pending.current = { method };
      setPhase("pending");
      if (document.visibilityState !== "hidden") {
        pending.current.timer = setTimeout(showInstructions, FALLBACK_MS);
      }
    },
    [showInstructions],
  );

  useEffect(() => {
    const onVisibility = () => {
      const attempt = pending.current;
      if (!attempt) return;
      if (document.visibilityState === "hidden") {
        clearTimeout(attempt.timer);
        attempt.timer = undefined;
      } else {
        showInstructions();
      }
    };
    const onPageShow = () => {
      if (pending.current) showInstructions();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      clearTimeout(pending.current?.timer);
    };
  }, [showInstructions]);

  // Optional automatic Android attempt (INAPP_AUTO_ESCAPE_ANDROID=1, off by
  // default until verified on devices). Once per tab session; skipped when the
  // once-flag cannot be stored, because nothing would then stop a loop.
  const auto = useRef<{ cancelled: boolean } | null>(null);
  useEffect(() => {
    if (auto.current) {
      // Strict Mode re-runs effects on the same instance: resume, don't restart.
      const run = auto.current;
      run.cancelled = false;
      return () => {
        run.cancelled = true;
      };
    }
    if (!escape.autoAttempt || mode !== "public" || primary?.method !== "intent") return;
    // Read storage directly: the hydrated `stored` value is still false here.
    if (readFlag(key) || readFlag(`${key}:auto`)) return;
    if (!writeFlag(`${key}:auto`)) return;

    const run = { cancelled: false };
    auto.current = run;
    const cap = new Promise<void>((resolve) => setTimeout(resolve, AUTO_ESCAPE_WAIT_MS));
    // Let PageBeacon queue the webview's page view first. Only ordering:
    // counting never depends on it (src/lib/handoff.ts).
    void Promise.race([pageviewQueued, cap]).then(() => {
      if (run.cancelled || pending.current) return;
      track("attempt", primary.method);
      arm(primary.method);
      navigate(primary.url);
    });
    return () => {
      run.cancelled = true;
    };
    // Mount-only by design: the escape plan is fixed for the page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (copy === "manual") manualRef.current?.select();
  }, [copy]);

  if (stored || dismissed) return null;

  const label = inAppLabel(escape.app);
  const actionLabel =
    phase === "pending"
      ? "Opening…"
      : phase === "instructions"
        ? "Try again"
        : primary?.method === "x_safari"
          ? "Open in Safari"
          : "Open in browser";

  const onEscape = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!primary || pending.current) {
      // Already attempting: never launch the browser twice.
      event.preventDefault();
      return;
    }
    if (primary.via === "open") {
      event.preventDefault();
      let opened: Window | null = null;
      try {
        opened = openWindow(primary.url);
      } catch {
        opened = null;
      }
      if (!opened) navigate(primary.url);
    }
    track("attempt", primary.method);
    arm(primary.method);
  };

  const onCopy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(escape.url);
      setCopy("copied");
      track("copied");
      setTimeout(() => setCopy((c) => (c === "copied" ? "idle" : c)), 2000);
    } catch {
      // Absent, or rejected (no permission, not focused): let them copy by hand.
      setCopy("manual");
    }
  };

  const onDismiss = () => {
    clearTimeout(pending.current?.timer);
    pending.current = null;
    setDismissed(true);
    if (mode === "public") writeFlag(key);
  };

  const buttonStyle = {
    backgroundColor: cta?.background ?? "var(--ln-color-primary)",
    color: cta?.color ?? "var(--ln-color-bg)",
    outlineColor: "var(--ln-color-text)",
  };

  return (
    <div
      role="region"
      aria-label="Open in browser"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-2.5 text-sm"
      style={{
        backgroundColor: "var(--ln-color-surface)",
        color: "var(--ln-color-text)",
        borderBottom: "1px solid var(--ln-border-color)",
      }}
    >
      <p aria-live="polite" className="min-w-0 text-center">
        {phase === "instructions" ? (
          <>
            Still here? Open this page from {label}’s menu: {escapeInstructions(escape)}
          </>
        ) : (
          <>You’re in {label}. Open this page in your browser for the best experience.</>
        )}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {primary && (
          // No target, no rel, no data-link-id: a _blank on an intent:// link
          // can open another in-app tab, and the escape is not a link click.
          <a
            href={primary.url}
            onClick={onEscape}
            aria-disabled={phase === "pending" || undefined}
            className="rounded-full px-3 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 aria-disabled:opacity-70"
            style={buttonStyle}
          >
            {actionLabel}
          </a>
        )}
        {phase === "instructions" && (
          <button
            type="button"
            onClick={onCopy}
            className="rounded-full px-3 py-1.5 font-medium underline underline-offset-2 focus-visible:outline-2"
            style={{ outlineColor: "var(--ln-color-text)" }}
          >
            {copy === "copied" ? "Copied" : "Copy link"}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-base leading-none opacity-70 hover:opacity-100 focus-visible:outline-2"
          style={{ outlineColor: "var(--ln-color-text)" }}
        >
          ×
        </button>
      </div>
      {copy === "manual" && (
        <input
          ref={manualRef}
          readOnly
          value={escape.url}
          aria-label="Page link"
          onFocus={(e) => e.currentTarget.select()}
          className="w-full max-w-md rounded border px-2 py-1 text-xs"
          style={{ borderColor: "var(--ln-border-color)", backgroundColor: "var(--ln-color-bg)" }}
        />
      )}
    </div>
  );
}
