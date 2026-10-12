import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExamplePage } from "@/components/marketing/example-page";
import { FEATURE_LIST, FEATURES, type FeatureSlug } from "@/lib/marketing/feature-content";
import { SITE_URL } from "@/lib/site";
import { serializeJsonLd } from "@/lib/json-ld";

export const dynamicParams = false;
export function generateStaticParams() { return FEATURE_LIST.map(({ slug }) => ({ feature: slug })); }

type Props = { params: Promise<{ feature: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { feature } = await params;
  if (!(feature in FEATURES)) return {};
  const content = FEATURES[feature as FeatureSlug];
  const url = `${SITE_URL}/features/${content.slug}`;
  return {
    title: `${content.title} | LinkNest`, description: content.description,
    alternates: { canonical: url },
    openGraph: { title: content.title, description: content.description, url },
    twitter: { card: "summary_large_image" },
  };
}

export default async function FeaturePage({ params }: Props) {
  const { feature } = await params;
  if (!(feature in FEATURES)) notFound();
  const content = FEATURES[feature as FeatureSlug];
  const related = FEATURE_LIST.filter((item) => item.slug !== content.slug).slice(0, 3);
  const url = `${SITE_URL}/features/${content.slug}`;
  return (
    <main className="bg-white pb-24 pt-32">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: SITE_URL }, { "@type": "ListItem", position: 2, name: "Features", item: `${SITE_URL}/features` }, { "@type": "ListItem", position: 3, name: content.label, item: url }] }) }} />
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <nav aria-label="Breadcrumb" className="text-sm text-slate"><Link href="/" className="hover:text-indigo">Home</Link> / <Link href="/features" className="hover:text-indigo">Features</Link> / {content.label}</nav>
        <div className="mt-10 grid items-center gap-12 lg:grid-cols-[1fr_420px]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-coral">{content.eyebrow}</p>
            <h1 className="mt-4 font-serif text-[clamp(38px,5vw,58px)] leading-tight text-indigo">{content.title}</h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate">{content.intro}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-lg bg-coral px-6 py-3 font-bold text-white hover:bg-coral-hover">Create your free page</Link>
              <Link href="/pricing" className="rounded-lg border border-mist px-6 py-3 font-semibold text-indigo hover:border-indigo">Compare plans</Link>
            </div>
          </div>
          <figure className="overflow-hidden rounded-2xl border border-black/5 bg-cloud shadow-[var(--shadow-md)]">
            <div className="max-h-[520px] overflow-hidden [&_.ln-page]:min-h-0"><ExamplePage kind={content.example} focus={content.slug === "email-capture" ? "email_capture" : content.slug === "embeds" ? "embed" : undefined} /></div>
            <figcaption className="bg-white px-5 py-3 text-xs text-slate">Fictional example rendered with LinkNest. Preview controls are inactive.</figcaption>
          </figure>
        </div>
        <div className="mt-20 grid gap-5 lg:grid-cols-2">
          {content.sections.map((section) => (
            <section key={section.title} className="rounded-2xl bg-sand p-7">
              <h2 className="text-xl font-bold text-indigo">{section.title}</h2>
              <p className="mt-3 leading-relaxed text-slate">{section.body}</p>
            </section>
          ))}
        </div>
        <section className="mt-20 rounded-2xl border border-mist/50 p-7 sm:p-10">
          <h2 className="font-serif text-3xl text-indigo">How to get started</h2>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            {content.steps.map((step, index) => <li key={step} className="leading-relaxed text-slate"><span className="mb-2 block text-sm font-bold text-coral">0{index + 1}</span>{step}</li>)}
          </ol>
        </section>
        <section className="mx-auto mt-20 max-w-[780px]">
          <h2 className="font-serif text-3xl text-indigo">Common questions</h2>
          <div className="mt-6 space-y-3">{content.faqs.map((faq) => <details key={faq.question} className="rounded-xl border border-mist/60 p-5"><summary className="cursor-pointer font-semibold text-indigo">{faq.question}</summary><p className="mt-3 leading-relaxed text-slate">{faq.answer}</p></details>)}</div>
        </section>
        <section className="mt-20">
          <h2 className="font-serif text-3xl text-indigo">Explore more ways to build</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">{related.map((item) => <Link key={item.slug} href={`/features/${item.slug}`} className="rounded-xl border border-mist/60 p-5 text-indigo hover:border-coral"><span className="block font-bold">{item.label}</span><span className="mt-2 block text-sm text-slate">{item.description}</span></Link>)}</div>
        </section>
        <div className="mt-20 rounded-2xl bg-indigo p-8 text-center text-white"><h2 className="font-serif text-3xl">Give your work a better home.</h2><p className="mt-3 text-white/75">Start free and publish a page that does more than list links.</p><Link href="/signup" className="mt-6 inline-block rounded-lg bg-coral px-6 py-3 font-bold hover:bg-coral-hover">Create your free page</Link></div>
      </div>
    </main>
  );
}
