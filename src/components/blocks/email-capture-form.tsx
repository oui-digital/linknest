"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  TurnstileWidget,
  turnstileSatisfied,
  type TurnstileHandle,
} from "@/components/auth/turnstile-widget";
import { useBlockRuntime } from "./block-runtime";

type Copy = {
  heading?: string;
  description?: string;
  buttonLabel?: string;
  successMessage?: string;
};

const DISABLED_TURNSTILE = { enabled: false, siteKey: null };

/**
 * Email sign-up form (double opt-in). The Cloudflare Turnstile script loads
 * only once the visitor focuses the field, so pages with this block do not
 * pull a third-party script on first load. The consent sentence matches the
 * one the server stores with the request.
 */
export function EmailCaptureForm({ blockId, copy }: { blockId: string; copy: Copy }) {
  const { mode, pageId, pageTitle, turnstile = DISABLED_TURNSTILE, listOpen = true } = useBlockRuntime();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [engaged, setEngaged] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const widget = useRef<TurnstileHandle>(null);
  const preview = mode === "preview";
  const inputId = `email-${blockId}`;

  const box: React.CSSProperties = {
    borderRadius: "var(--ln-border-radius)",
    backgroundColor: "var(--ln-color-surface)",
    border: "1px solid var(--ln-border-color)",
  };

  if (status === "sent") {
    return (
      <div role="status" className="w-full p-5 text-center text-sm" style={box}>
        {copy.successMessage || "Almost there: check your inbox and confirm your subscription."}
      </div>
    );
  }

  if (!listOpen && !preview) {
    return (
      <div className="w-full p-5 text-center text-sm" style={{ ...box, color: "var(--ln-color-text-muted)" }}>
        Sign-ups are currently closed.
      </div>
    );
  }

  return (
    <form
      className="w-full space-y-3 p-5"
      style={box}
      onSubmit={async (e) => {
        e.preventDefault();
        if (preview) return;
        setStatus("sending");
        try {
          const res = await fetch("/api/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pageId, blockId, email, website, turnstileToken: token }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            setStatus("sent");
          } else {
            setError(data.error || "Something went wrong. Please try again.");
            setStatus("error");
          }
        } catch {
          setError("Network error. Please try again.");
          setStatus("error");
        } finally {
          widget.current?.reset(); // tokens are single-use
        }
      }}
    >
      <fieldset disabled={preview || status === "sending"} className="space-y-3">
        <legend
          className="w-full text-center"
          style={{
            fontFamily: "var(--ln-font-heading)",
            fontWeight: "var(--ln-font-weight-heading)",
            color: "var(--ln-color-text)",
          }}
        >
          {copy.heading || "Get updates by email"}
        </legend>
        {copy.description && (
          <p className="text-center text-sm" style={{ color: "var(--ln-color-text-muted)" }}>
            {copy.description}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={inputId} className="sr-only">
            Email address
          </label>
          <input
            id={inputId}
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setEngaged(true)}
            placeholder="you@example.com"
            className="min-w-0 flex-1 px-3 py-2 text-sm outline-none focus-visible:outline-2"
            style={{
              borderRadius: "var(--ln-btn-radius)",
              border: "1px solid var(--ln-border-color)",
              backgroundColor: "var(--ln-color-bg)",
              color: "var(--ln-color-text)",
              outlineColor: "var(--ln-color-text)",
            }}
          />
          <button
            type="submit"
            disabled={!email || (!preview && !turnstileSatisfied(turnstile, token))}
            className="px-4 py-2 text-sm font-semibold transition-opacity disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              borderRadius: "var(--ln-btn-radius)",
              backgroundColor: "var(--ln-btn-bg)",
              color: "var(--ln-btn-text)",
              borderWidth: "var(--ln-btn-border-w)",
              borderColor: "var(--ln-btn-border-c)",
              borderStyle: "solid",
              outlineColor: "var(--ln-color-text)",
            }}
          >
            {status === "sending" ? "Sending…" : copy.buttonLabel || "Subscribe"}
          </button>
        </div>
        {/* Honeypot: hidden from people and assistive tech, filled by bots. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Website
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>
        {engaged && !preview && (
          <TurnstileWidget ref={widget} config={turnstile} action="subscribe" onToken={setToken} />
        )}
        <p className="text-center text-xs" style={{ color: "var(--ln-color-text-muted)" }}>
          By subscribing you agree to receive emails from {pageTitle}. Unsubscribe anytime.{" "}
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
        </p>
        {status === "error" && (
          <p role="alert" className="text-center text-sm text-red-600">
            {error}
          </p>
        )}
      </fieldset>
    </form>
  );
}
