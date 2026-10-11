import Nav from "@/components/marketing/nav";
import Hero from "@/components/marketing/hero";
import SocialProof from "@/components/marketing/social-proof";
import TemplatesShowcase from "@/components/marketing/templates-showcase";
import Features from "@/components/marketing/features";
import PricingPreview from "@/components/marketing/pricing-preview";
import FAQ from "@/components/marketing/faq";
import FinalCTA from "@/components/marketing/final-cta";
import Footer from "@/components/marketing/footer";
import ScrollReveal from "@/components/marketing/scroll-reveal";

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

      <Nav />

      <main id="main-content">
        <Hero />
        <SocialProof />

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
