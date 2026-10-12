/* FinalCTA — Full-width deep indigo CTA with brand typography.
   Server component. */

import Link from "next/link";

export default function FinalCTA() {
  return (
    <section className="bg-indigo py-20 lg:py-28">
      <div className="mx-auto max-w-[720px] px-5 sm:px-8 text-center">
        <h2 className="font-serif text-[clamp(28px,4vw,44px)] leading-[1.15] tracking-[-0.01em] text-white">
          Your audience is already looking for you.
        </h2>
        <p className="mx-auto mt-5 max-w-[540px] text-lg leading-relaxed text-white/80">
          Give them one beautiful place to find everything. Start your LinkNest
          for free&mdash;no credit card required.
        </p>
        <Link
          href="/signup"
          className="mt-8 inline-block rounded-[10px] bg-coral px-8 py-[14px] text-[15px] font-bold tracking-[0.02em] text-white transition-all duration-200 hover:-translate-y-px hover:bg-coral-hover hover:shadow-[0_4px_16px_rgba(232,97,77,0.3)]"
        >
          Create Your LinkNest &mdash; Free
        </Link>
      </div>
    </section>
  );
}
