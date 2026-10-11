"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import {
  completeOnboarding,
  checkSlugAvailability,
  type OnboardingState,
} from "@/lib/actions/onboarding";

export function OnboardingForm() {
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [slugStatus, setSlugStatus] = useState<{
    checking: boolean;
    available?: boolean;
    reason?: string;
  }>({ checking: false });

  const [state, formAction, isPending] = useActionState<OnboardingState, FormData>(
    completeOnboarding,
    {},
  );

  // Debounced slug availability check
  const checkAvailability = useCallback(async (value: string) => {
    if (value.length < 3) {
      setSlugStatus({ checking: false });
      return;
    }

    setSlugStatus({ checking: true });
    const result = await checkSlugAvailability(value);
    setSlugStatus({
      checking: false,
      available: result.available,
      reason: "reason" in result ? result.reason : undefined,
    });
  }, []);

  useEffect(() => {
    // Reset inside the timeout rather than synchronously in the effect body:
    // a synchronous setState here triggers a cascading render on every
    // keystroke that shortens the slug below the minimum length.
    const timer = setTimeout(() => {
      if (slug.length < 3) {
        setSlugStatus({ checking: false });
        return;
      }
      checkAvailability(slug);
    }, 400);

    return () => clearTimeout(timer);
  }, [slug, checkAvailability]);

  const normalizedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");

  return (
    <form action={formAction} className="space-y-6">
      <div>
        <label
          htmlFor="slug"
          className="block text-sm font-medium text-gray-700"
        >
          Username
        </label>
        <div className="mt-1">
          <div className="flex items-center rounded-lg border border-gray-300 focus-within:border-black focus-within:ring-1 focus-within:ring-black">
            <span className="pl-3 text-sm text-gray-500">linknest.click/@</span>
            <input
              id="slug"
              name="slug"
              type="text"
              value={normalizedSlug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="yourname"
              autoComplete="off"
              className="flex-1 border-0 bg-transparent py-3 pr-3 text-sm outline-none"
              required
              minLength={3}
              maxLength={63}
            />
          </div>
          {slug.length >= 3 && (
            <p
              className={`mt-1 text-xs ${slugStatus.checking
                  ? "text-gray-400"
                  : slugStatus.available
                    ? "text-green-600"
                    : "text-red-600"
                }`}
            >
              {slugStatus.checking
                ? "Checking availability..."
                : slugStatus.available
                  ? `linknest.com/@${normalizedSlug} is available!`
                  : slugStatus.reason}
            </p>
          )}
        </div>
      </div>

      <div>
        <label
          htmlFor="title"
          className="block text-sm font-medium text-gray-700"
        >
          Page title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="My Links"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black"
          required
          maxLength={255}
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending || !slugStatus.available || !title.trim()}
        className="w-full rounded-lg bg-black px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Creating..." : "Create my page"}
      </button>
    </form>
  );
}
