"use client";

import { useState } from "react";
import Link from "next/link";

import { FREE_FEATURES, PRO_FEATURES, PRICE_MONTHLY, PRICE_YEARLY, PRICE_YEARLY_MONTHLY_EQUIVALENT, YEARLY_SAVINGS_PERCENT } from "@/lib/pricing";

export function PricingCards({
  currentPlan,
}: {
  currentPlan: "free" | "pro" | null;
}) {
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(false);

  const price = interval === "monthly" ? PRICE_MONTHLY : PRICE_YEARLY_MONTHLY_EQUIVALENT;
  const billedText =
    interval === "monthly" ? `$${PRICE_MONTHLY}/month` : `$${PRICE_YEARLY}/year ($${PRICE_YEARLY_MONTHLY_EQUIVALENT}/month)`;

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Interval toggle */}
      <div className="mb-8 flex justify-center">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          <button
            onClick={() => setInterval("monthly")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              interval === "monthly"
              ? "bg-indigo text-white"
              : "text-slate hover:text-indigo"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval("yearly")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              interval === "yearly"
              ? "bg-indigo text-white"
              : "text-slate hover:text-indigo"
            }`}
          >
            Yearly
            <span className="ml-1 text-xs opacity-70">save {YEARLY_SAVINGS_PERCENT}%</span>
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Free */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8">
          <h3 className="text-lg font-semibold">Free</h3>
          <div className="mt-2">
            <span className="text-4xl font-bold">$0</span>
            <span className="text-gray-500">/month</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Everything you need to get started
          </p>

          <div className="mt-6">
            {currentPlan === null ? (
              <Link href="/signup" className="block rounded-lg border border-mist px-4 py-2.5 text-center text-sm font-semibold text-indigo hover:border-indigo">Create your free page</Link>
            ) : currentPlan === "free" ? (
              <div className="rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-medium text-gray-500">
                Current plan
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-medium text-gray-500">
                Included
              </div>
            )}
          </div>

          <ul className="mt-6 space-y-3">
            {FREE_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm">
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* Pro */}
        <div className="relative rounded-2xl border-2 border-coral bg-white p-8">
          <div className="absolute -top-3 left-6 rounded-full bg-coral px-3 py-0.5 text-xs font-semibold text-white">
            More room to grow
          </div>
          <h3 className="text-lg font-semibold">Pro</h3>
          <div className="mt-2">
            <span className="text-4xl font-bold">${price}</span>
            <span className="text-gray-500">/month</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">{billedText}</p>

          <div className="mt-6">
            {currentPlan === "pro" ? (
              <div className="rounded-lg bg-gray-100 px-4 py-2.5 text-center text-sm font-medium text-gray-500">
                Current plan
              </div>
            ) : currentPlan === null ? (
              <div>
                <Link href="/signup" className="block w-full rounded-lg bg-coral px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-coral-hover">Start free</Link>
                <p className="mt-2 text-center text-xs text-slate">Upgrade from your dashboard.</p>
              </div>
            ) : (
              <button
                onClick={handleUpgrade}
                disabled={loading}
                className="w-full rounded-lg bg-coral px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-coral-hover disabled:opacity-50"
              >
                {loading ? "Redirecting..." : "Upgrade to Pro"}
              </button>
            )}
          </div>

          <ul className="mt-6 space-y-3">
            {PRO_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm">
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-black"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
