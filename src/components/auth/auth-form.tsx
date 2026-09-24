"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import {
  TurnstileWidget,
  turnstileSatisfied,
  type TurnstileHandle,
} from "@/components/auth/turnstile-widget";
import {
  sendMagicLink,
  loginWithPassword,
  registerWithPassword,
  type AuthState,
} from "@/lib/actions/auth";
import type { TurnstileClientConfig } from "@/lib/turnstile-types";

const initialState: AuthState = {};

type AuthAction = (state: AuthState, formData: FormData) => Promise<AuthState>;

/**
 * A form action gated by Turnstile. The token lives in state and is rendered
 * into a hidden cf-turnstile-response field; after every attempt the widget is
 * reset, because Siteverify accepts each token once and a retry with the old
 * one would always fail.
 */
function useTurnstileAction(action: AuthAction, config: TurnstileClientConfig) {
  const widget = useRef<TurnstileHandle>(null);
  const [token, setToken] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    async (previous: AuthState, formData: FormData) => {
      try {
        return await action(previous, formData);
      } finally {
        widget.current?.reset();
      }
    },
    initialState,
  );
  return {
    state,
    formAction,
    pending,
    ready: turnstileSatisfied(config, token),
    field: <input type="hidden" name="cf-turnstile-response" value={token ?? ""} />,
    widgetProps: { ref: widget, config, onToken: setToken },
  };
}

export function AuthForm({
  mode,
  turnstile,
}: {
  mode: "login" | "signup";
  turnstile: TurnstileClientConfig;
}) {
  const [method, setMethod] = useState<"magic-link" | "password">("magic-link");

  return (
    <div className="space-y-6">
      {method === "magic-link" ? (
        <MagicLinkForm turnstile={turnstile} />
      ) : mode === "login" ? (
        <PasswordLoginForm />
      ) : (
        <PasswordRegisterForm turnstile={turnstile} />
      )}

      <button
        type="button"
        onClick={() =>
          setMethod(method === "magic-link" ? "password" : "magic-link")
        }
        className="w-full text-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        {method === "magic-link"
          ? "Use password instead"
          : "Use magic link instead"}
      </button>

      <Divider />
      <OAuthButtons />

      <p className="text-center text-sm text-gray-600">
        {mode === "login" ? (
          <>
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-gray-900 hover:underline">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-gray-900 hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function MagicLinkForm({ turnstile }: { turnstile: TurnstileClientConfig }) {
  const { state, formAction: action, pending, ready, field, widgetProps } =
    useTurnstileAction(sendMagicLink, turnstile);

  if (state.success) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
        <p className="text-sm font-medium text-green-800">{state.success}</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="magic-email" className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          id="magic-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>
      {field}
      <TurnstileWidget action="magic_link" {...widgetProps} />
      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending || !ready}
        className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? "Sending link..." : "Send magic link"}
      </button>
    </form>
  );
}

function PasswordLoginForm() {
  const [state, action, pending] = useActionState(loginWithPassword, initialState);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>
      <div>
        <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>
      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

function PasswordRegisterForm({ turnstile }: { turnstile: TurnstileClientConfig }) {
  const { state, formAction: action, pending, ready, field, widgetProps } =
    useTurnstileAction(registerWithPassword, turnstile);

  if (state.success) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
        <p className="text-sm font-medium text-green-800">{state.success}</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="register-name" className="block text-sm font-medium text-gray-700 mb-1">
          Name
        </label>
        <input
          id="register-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          placeholder="Your name"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>
      <div>
        <label htmlFor="register-email" className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>
      <div>
        <label htmlFor="register-password" className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          id="register-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="At least 8 characters"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>
      {field}
      <TurnstileWidget action="register" {...widgetProps} />
      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending || !ready}
        className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}

function Divider() {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-gray-200" />
      </div>
      <div className="relative flex justify-center text-sm">
        <span className="bg-white px-4 text-gray-400">or</span>
      </div>
    </div>
  );
}
