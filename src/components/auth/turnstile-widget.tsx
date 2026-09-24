"use client";

import Script from "next/script";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { TurnstileClientConfig } from "@/lib/turnstile-types";

type TurnstileRenderOptions = {
  sitekey: string;
  action: string;
  appearance: "always" | "execute" | "interaction-only";
  "response-field": boolean;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
  "timeout-callback": () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export type TurnstileHandle = { reset: () => void };

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Cloudflare Turnstile, rendered explicitly so it survives the auth form's
 * magic-link/password toggle remounting its children.
 *
 * The token comes back through `onToken`; the parent renders it into a hidden
 * `cf-turnstile-response` input ("response-field" is off so there is exactly
 * one field with that name). Tokens are single-use, so the parent calls
 * `reset()` after every submission attempt, successful or not.
 *
 * `interaction-only` keeps the widget invisible unless Cloudflare needs the
 * visitor to click.
 */
export function TurnstileWidget({
  config,
  action,
  onToken,
  ref,
}: {
  config: TurnstileClientConfig;
  action: string;
  onToken: (token: string | null) => void;
  ref?: Ref<TurnstileHandle>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  // Already loaded by an earlier mount: next/script will not load it twice.
  const [ready, setReady] = useState(
    () => typeof window !== "undefined" && Boolean(window.turnstile),
  );

  useEffect(() => {
    onTokenRef.current = onToken;
  });

  const siteKey = config.enabled ? config.siteKey : null;

  useEffect(() => {
    const api = window.turnstile;
    if (!ready || !siteKey || !container.current || !api) return;
    const id = api.render(container.current, {
      sitekey: siteKey,
      action,
      appearance: "interaction-only",
      "response-field": false,
      callback: (token) => onTokenRef.current(token),
      "expired-callback": () => onTokenRef.current(null),
      "error-callback": () => onTokenRef.current(null),
      "timeout-callback": () => onTokenRef.current(null),
    });
    widgetId.current = id;
    return () => {
      widgetId.current = null;
      try {
        api.remove(id);
      } catch {
        // Already gone (e.g. the form was replaced by a success message).
      }
    };
  }, [ready, siteKey, action]);

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        onTokenRef.current(null);
        const id = widgetId.current;
        if (!id || !window.turnstile) return;
        try {
          window.turnstile.reset(id);
        } catch {
          // The widget may have unmounted between submit and reset.
        }
      },
    }),
    [],
  );

  if (!config.enabled) return null;

  if (!siteKey) {
    return (
      <p role="alert" className="text-sm text-red-600">
        Verification is temporarily unavailable. Please try again later.
      </p>
    );
  }

  return (
    <>
      <Script src={SCRIPT_SRC} strategy="afterInteractive" onReady={() => setReady(true)} />
      <div ref={container} />
    </>
  );
}

/** Whether a form gated by Turnstile may be submitted yet. */
export function turnstileSatisfied(config: TurnstileClientConfig, token: string | null): boolean {
  if (!config.enabled) return true;
  return Boolean(config.siteKey && token);
}
