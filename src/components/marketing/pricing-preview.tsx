/* PricingPreview — Free vs Pro cards with monthly/yearly toggle.
   Feature lists match actual product (from pricing-cards.tsx).
   Client component for toggle state. */

"use client";

import { useState } from "react";
import Link from "next/link";

import { FREE_FEATURES, PRO_FEATURES, PRICE_MONTHLY, PRICE_YEARLY, PRICE_YEARLY_MONTHLY_EQUIVALENT, YEARLY_SAVINGS_PERCENT } from "@/lib/pricing";

export default function PricingPreview() {
  const [annual, setAnnual] = useState(false);
  const price = annual ? PRICE_YEARLY_MONTHLY_EQUIVALENT : PRICE_MONTHLY;

  return (
    <section id="pricing" className="py-16 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        {/* Header */}
        <div className="mx-auto max-w-[720px] text-center">
          <h2 className="font-serif text-[clamp(28px,4vw,44px)] leading-[1.15] tracking-[-0.01em] text-indigo">
            Simple, transparent pricing.
          </h2>
          <p className="mt-4 text-lg text-slate">
            Free forever. Upgrade when you&apos;re ready.
          </p>
        </div>

        {/* Interval toggle */}
        <div className="mt-8 flex items-center justify-center gap-3">
          <span className={`text-sm font-medium transition-colors ${!annual ? "text-indigo" : "text-slate"}`}>
            Monthly
          </span>
          <button
            onClick={() => setAnnual(!annual)}
            className="relative h-7 w-12 rounded-full bg-mist/40 transition-colors"
            role="switch"
            aria-checked={annual}
            aria-label="Toggle annual billing"
          >
            <div
              className={`absolute top-1 h-5 w-5 rounded-full bg-coral shadow-sm transition-transform duration-200 ${
                annual ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className={`text-sm font-medium transition-colors ${annual ? "text-indigo" : "text-slate"}`}>
            Yearly{" "}
            <span className="text-teal font-bold">save {YEARLY_SAVINGS_PERCENT}%</span>
          </span>
        </div>

        {/* Pricing cards */}
        <div className="mx-auto mt-12 grid max-w-[880px] gap-8 md:grid-cols-2">
          {/* Free */}
          <div className="rounded-[16px] border border-[rgba(0,0,0,0.06)] bg-white p-8 shadow-[var(--shadow-sm)]">
            <h3 className="font-serif text-2xl text-indigo">Free</h3>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="font-serif text-5xl text-indigo">$0</span>
              <span className="text-slate">/month</span>
            </div>
            <p className="mt-3 text-sm text-slate">Everything you need to get started</p>

            <Link
              href="/signup"
              className="mt-8 block w-full rounded-[10px] border-[1.5px] border-mist px-6 py-3 text-center text-[15px] font-bold tracking-[0.02em] text-indigo transition-all duration-200 hover:border-indigo hover:bg-[rgba(26,26,46,0.03)]"
            >
              Get Started Free
            </Link>

            <ul className="mt-8 space-y-3">
              {FREE_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-mist" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-slate">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pro */}
          <div className="relative rounded-[16px] border-2 border-coral bg-white p-8 shadow-[var(--shadow-md)]">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="rounded-full bg-coral px-4 py-1 text-[13px] font-bold text-white shadow-sm">
                More room to grow
              </span>
            </div>

            <h3 className="font-serif text-2xl text-indigo">Pro</h3>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="font-serif text-5xl text-indigo">${price}</span>
              <span className="text-slate">/month</span>
            </div>
            {annual && (
              <p className="mt-1 text-sm font-medium text-teal">
                Billed annually at ${PRICE_YEARLY}
              </p>
            )}
            <p className="mt-3 text-sm text-slate">For creators ready to stand out</p>

            <Link
              href="/signup"
              className="mt-8 block w-full rounded-[10px] bg-coral px-6 py-3 text-center text-[15px] font-bold tracking-[0.02em] text-white transition-all duration-200 hover:-translate-y-px hover:bg-coral-hover hover:shadow-[0_4px_16px_rgba(232,97,77,0.3)]"
            >
              Start free
            </Link>
            <p className="mt-2 text-center text-xs text-slate">Upgrade from your dashboard.</p>

            <ul className="mt-8 space-y-3">
              {PRO_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-coral" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-charcoal">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
