import Nav from "@/components/marketing/nav";
import Footer from "@/components/marketing/footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — LinkNest",
  description: "Terms and conditions for using LinkNest.",
};

export default function TermsPage() {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-coral focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
      >
        Skip to content
      </a>

      <Nav />

      <main id="main-content" className="pt-28 pb-16 sm:pt-32 lg:pt-40 lg:pb-24">
        <div className="mx-auto max-w-[720px] px-5 sm:px-8">
          <h1 className="font-serif text-[clamp(32px,5vw,48px)] leading-[1.15] tracking-[-0.01em] text-indigo">
            Terms of Service
          </h1>
          <p className="mt-4 text-sm text-slate">
            Last updated: September 23, 2026
          </p>

          {/* 1. Service Description */}
          <section className="mt-12">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              1. Service Description
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>
                LinkNest is a link-in-bio web application that allows users to
                create and publish a single public webpage containing curated
                links and related content. LinkNest is operated by Oui Digital, a
                doing-business-as (&ldquo;DBA&rdquo;) of Kalyxo LLC, a
                California limited liability company.
              </p>
            </div>
          </section>

          {/* 2. Eligibility and Account Responsibilities */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              2. Eligibility and Account Responsibilities
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>
                You must be able to form a legally binding agreement to use the
                Service. You are responsible for:
              </p>
              <ul className="ml-6 list-disc space-y-2">
                <li>Providing accurate account information</li>
                <li>
                  Maintaining the confidentiality of your login credentials
                </li>
                <li>All activity that occurs under your account</li>
              </ul>
            </div>
          </section>

          {/* 3. User-Generated Content */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              3. User-Generated Content
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>
                You retain ownership of content you create and upload. By using
                the Service, you grant LinkNest a non-exclusive, worldwide
                license to host, display, process, and deliver your content
                solely for the purpose of operating the Service.
              </p>
            </div>
          </section>

          {/* 4. Public Content and Sharing */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              4. Public Content and Sharing
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>
                Published pages are publicly accessible. You are responsible for
                any content you choose to publish and for ensuring that you have
                the rights to share it.
              </p>
            </div>
          </section>

          {/* 5. Acceptable Use */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              5. Acceptable Use
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>You agree not to:</p>
              <ul className="ml-6 list-disc space-y-2">
                <li>
                  Upload or link to unlawful, harmful, or malicious content
                </li>
                <li>Circumvent security or rate-limiting measures</li>
                <li>
                  Use the Service to distribute malware, phishing links, or scams
                </li>
                <li>Interfere with the operation of the Service</li>
                <li>
                  Publish spam, including bulk, repetitive, or automatically
                  generated pages
                </li>
                <li>
                  Create pages primarily to build backlinks or manipulate search
                  engine rankings rather than to present yourself or your work
                  to visitors
                </li>
                <li>
                  Promote gambling, betting, lotteries, or other regulated
                  activities without every license and authorization required
                  where you and your visitors are located
                </li>
              </ul>
              <p>
                URLs added to pages may be checked against threat databases.
              </p>
              <p>
                We may review, remove, or unpublish any content, or refuse or
                limit access to the Service, at our sole discretion and without
                prior notice, including where we believe content violates these
                Terms or harms the Service, its users, or third parties. We are
                not obligated to monitor content.
              </p>
            </div>
          </section>

          {/* 6. Free and Paid Features */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              6. Free and Paid Features
            </h2>
            <div className="mt-4 text-[15px] leading-relaxed text-slate">
              <p>
                LinkNest offers both free and paid subscription plans. Features
                and limits vary by plan.
              </p>
            </div>
          </section>

          {/* 7. Subscriptions, Billing, and Cancellations */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              7. Subscriptions, Billing, and Cancellations
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>Paid subscriptions are processed through Stripe.</p>
              <ul className="ml-6 list-disc space-y-2">
                <li>
                  Billing terms, pricing, and renewal intervals are disclosed at
                  checkout
                </li>
                <li>
                  Subscription management and cancellation are handled through
                  Stripe&apos;s billing portal
                </li>
                <li>
                  Refund handling follows Stripe&apos;s processes unless
                  otherwise stated
                </li>
              </ul>
            </div>
          </section>

          {/* 8. Intellectual Property */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              8. Intellectual Property
            </h2>
            <div className="mt-4 text-[15px] leading-relaxed text-slate">
              <p>
                The Service, including its software, design, and branding, is
                owned by LinkNest and protected by intellectual property laws. No
                rights are granted except as expressly stated.
              </p>
            </div>
          </section>

          {/* 9. Third-Party Services and Links */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              9. Third-Party Services and Links
            </h2>
            <div className="mt-4 text-[15px] leading-relaxed text-slate">
              <p>
                The Service integrates third-party services and allows links to
                external websites. We are not responsible for third-party
                content, services, or practices.
              </p>
            </div>
          </section>

          {/* 10. Disclaimers */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              10. Disclaimers
            </h2>
            <div className="mt-4 text-[15px] leading-relaxed text-slate">
              <p>
                The Service is provided &ldquo;as is&rdquo; and &ldquo;as
                available.&rdquo; We do not guarantee uninterrupted or error-free
                operation.
              </p>
            </div>
          </section>

          {/* 11. Limitation of Liability */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              11. Limitation of Liability
            </h2>
            <div className="mt-4 text-[15px] leading-relaxed text-slate">
              <p>
                To the maximum extent permitted by law, LinkNest will not be
                liable for indirect, incidental, or consequential damages arising
                from use of the Service.
              </p>
            </div>
          </section>

          {/* 12. Termination */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              12. Termination
            </h2>
            <div className="mt-4 text-[15px] leading-relaxed text-slate">
              <p>
                We may suspend or terminate accounts that violate these Terms or
                pose a security or legal risk, and may do so without prior
                notice. Content unpublished under these Terms may not be
                republished without our approval. Users may stop using the
                Service at any time.
              </p>
            </div>
          </section>

          {/* 13. Changes to the Service or Terms */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              13. Changes to the Service or Terms
            </h2>
            <div className="mt-4 text-[15px] leading-relaxed text-slate">
              <p>
                We may modify the Service or these Terms from time to time.
                Continued use constitutes acceptance of updated Terms.
              </p>
            </div>
          </section>

          {/* 14. Governing Law and Jurisdiction */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              14. Governing Law and Jurisdiction
            </h2>
            <div className="mt-4 text-[15px] leading-relaxed text-slate">
              <p>
                These Terms are governed by the laws of the State of California,
                United States, without regard to conflict-of-law principles.
              </p>
            </div>
          </section>

          {/* 15. Contact Information */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              15. Contact Information
            </h2>
            <div className="mt-4 text-[15px] leading-relaxed text-slate">
              <p>
                For questions about these Terms, contact us at{" "}
                <a
                  href="mailto:support@linknest.click"
                  className="text-coral underline underline-offset-2 hover:text-coral/80"
                >
                  support@linknest.click
                </a>
                .
              </p>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </>
  );
}
