import type { Metadata } from "next";
import Link from "next/link";
import { FEATURE_LIST } from "@/lib/marketing/feature-content";
import { SITE_URL } from "@/lib/site";
import { serializeJsonLd } from "@/lib/json-ld";

export const metadata: Metadata = {
  title: "LinkNest Features | More Than a Link-in-Bio Page",
  description: "Explore LinkNest features for content, bookings, email sign-ups, link analytics and brand customization.",
  alternates: { canonical: `${SITE_URL}/features` },
  openGraph: { title: "What you can build with LinkNest", description: "Share your work, grow an audience and learn what gets clicks.", url: `${SITE_URL}/features` },
  twitter: { card: "summary_large_image" },
};

export default function FeaturesIndex() {
  return (
    <main className="bg-cloud pb-24 pt-32">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: SITE_URL }, { "@type": "ListItem", position: 2, name: "Features", item: `${SITE_URL}/features` }] }) }} />
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-coral">Features</p>
        <h1 className="mt-4 max-w-3xl font-serif text-[clamp(40px,5vw,60px)] leading-tight text-indigo">More than a home for your links.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate">Bring your content, bookings and email audience together. Then use clear reporting to understand what visitors choose.</p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_LIST.map((feature) => (
            <article key={feature.slug} className="rounded-2xl border border-black/5 bg-white p-7 shadow-[var(--shadow-sm)]">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-coral">{feature.eyebrow}</p>
              <h2 className="mt-3 text-xl font-bold text-indigo"><Link href={`/features/${feature.slug}`} className="hover:text-coral">{feature.label}</Link></h2>
              <p className="mt-3 text-sm leading-relaxed text-slate">{feature.description}</p>
              <Link href={`/features/${feature.slug}`} className="mt-5 inline-block text-sm font-semibold text-indigo underline decoration-coral underline-offset-4">Explore feature →</Link>
            </article>
          ))}
        </div>
        <div className="mt-16 rounded-2xl bg-indigo p-8 text-white sm:p-10">
          <h2 className="font-serif text-3xl">Build a page that does more.</h2>
          <p className="mt-3 text-white/75">Start with a free page and grow into Pro when you need more room.</p>
          <Link href="/signup" className="mt-6 inline-block rounded-lg bg-coral px-6 py-3 font-bold text-white hover:bg-coral-hover">Create your free page</Link>
        </div>
      </div>
    </main>
  );
}
