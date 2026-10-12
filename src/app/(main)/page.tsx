import Nav from "@/components/marketing/nav";
import Hero from "@/components/marketing/hero";
import AudienceExamples from "@/components/marketing/audience-examples";
import TemplatesShowcase from "@/components/marketing/templates-showcase";
import Features from "@/components/marketing/features";
import PricingPreview from "@/components/marketing/pricing-preview";
import FAQ from "@/components/marketing/faq";
import FinalCTA from "@/components/marketing/final-cta";
import Footer from "@/components/marketing/footer";
import ScrollReveal from "@/components/marketing/scroll-reveal";
import { SITE_URL } from "@/lib/site";
import { serializeJsonLd } from "@/lib/json-ld";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LinkNest | Link-in-Bio Pages, Email Capture & Analytics",
  description: "Show your content, offer bookings, collect email sign-ups and see what gets clicks—all in a link-in-bio page that feels like your brand.",
  alternates: { canonical: SITE_URL },
  openGraph: { title: "LinkNest | A bio page that does more", description: "Share content, bookings and email sign-ups in one branded page.", url: SITE_URL },
  twitter: { card: "summary_large_image" },
};

export default function Home() {
  return (
    <>
      {/* Skip to Content Link for Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-coral focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
      >
        Skip to content
      </a>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({ "@context": "https://schema.org", "@type": "WebSite", name: "LinkNest", url: SITE_URL, publisher: { "@type": "Organization", name: "LinkNest", url: SITE_URL } }) }} />
      <Nav />

      <main id="main-content">
        <Hero />
        <AudienceExamples />

        <ScrollReveal>
          <TemplatesShowcase />
        </ScrollReveal>

        <ScrollReveal>
          <Features />
        </ScrollReveal>

        <ScrollReveal>
          <PricingPreview />
        </ScrollReveal>

        <ScrollReveal>
          <FAQ />
        </ScrollReveal>

        <FinalCTA />
      </main>

      <Footer />
    </>
  );
}
