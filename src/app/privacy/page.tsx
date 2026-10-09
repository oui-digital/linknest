import Nav from "@/components/marketing/nav";
import Footer from "@/components/marketing/footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — LinkNest",
  description:
    "How LinkNest collects, uses, and protects your information.",
};

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p className="mt-4 text-sm text-slate">
            Last updated: October 9, 2026
          </p>

          {/* 1. Scope and Applicability */}
          <section className="mt-12">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              1. Scope and Applicability
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>
                This Privacy Policy describes how LinkNest (&ldquo;we,&rdquo;
                &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, stores,
                and shares information in connection with the LinkNest web
                application (the &ldquo;Service&rdquo;). LinkNest is operated by
                Oui Digital, a doing-business-as (&ldquo;DBA&rdquo;) of Kalyxo
                LLC, a California limited liability company.
              </p>
              <p>It applies to:</p>
              <ul className="ml-6 list-disc space-y-2">
                <li>
                  Registered users who create and manage LinkNest accounts and
                  pages
                </li>
                <li>
                  Visitors who view publicly published LinkNest pages
                </li>
              </ul>
              <p>
                This policy applies only to the Service as currently implemented
                and does not cover third-party websites or services linked from
                user pages.
              </p>
            </div>
          </section>

          {/* 2. Information We Collect */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              2. Information We Collect
            </h2>

            <h3 className="mt-6 text-[17px] font-medium text-indigo">
              a. Information You Provide Directly
            </h3>
            <div className="mt-3 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>When you create or use an account, we collect:</p>
              <ul className="ml-6 list-disc space-y-2">
                <li>Name</li>
                <li>Email address</li>
                <li>
                  Password (stored only as a bcrypt hash, where applicable)
                </li>
                <li>
                  Profile image (if provided through Google or GitHub OAuth)
                </li>
                <li>
                  Workspace name, page titles, bios, links, text, images, and
                  other content you choose to create
                </li>
              </ul>
            </div>

            <h3 className="mt-6 text-[17px] font-medium text-indigo">
              b. Authentication and Account Data
            </h3>
            <div className="mt-3 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>
                Depending on the login method you use, we collect:
              </p>
              <ul className="ml-6 list-disc space-y-2">
                <li>
                  OAuth profile data from Google or GitHub (name, email address,
                  profile image)
                </li>
                <li>Authentication tokens provided by OAuth providers</li>
                <li>
                  Verification tokens for email verification or magic link login
                  (temporary)
                </li>
              </ul>
            </div>

            <h3 className="mt-6 text-[17px] font-medium text-indigo">
              c. Usage and Analytics Data
            </h3>
            <div className="mt-3 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>
                On publicly published pages only, we collect limited usage data:
              </p>
              <ul className="ml-6 list-disc space-y-2">
                <li>Page views</li>
                <li>
                  The domain of the page that linked to the visited page, as
                  reported by the visitor&apos;s browser (for example
                  instagram.com). Only the domain is kept; the full address is
                  never stored. Browsers often omit it, in which case nothing is
                  recorded.
                </li>
                <li>
                  Link click events (including the link label, destination URL,
                  and internal block identifier). Clicks on social icons, the
                  announcement banner and embedded media count as link clicks.
                </li>
              </ul>
              <p>
                Events are sent to our own server and forwarded to PostHog with a
                random identifier generated for each event, without cookies,
                local storage or visitor IP addresses. Events cannot be linked to
                one another or to a visitor.
              </p>
            </div>

            <h3 className="mt-6 text-[17px] font-medium text-indigo">
              d. Technical and Security Data
            </h3>
            <div className="mt-3 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>
                We collect limited technical data for security and abuse
                prevention purposes:
              </p>
              <ul className="ml-6 list-disc space-y-2">
                <li>
                  IP address of a visitor who submits an abuse report (stored to
                  enforce rate limits)
                </li>
                <li>
                  Error logs, stack traces, and performance data collected via
                  Sentry
                </li>
              </ul>
              <p>
                We do not log or store IP addresses of general page visitors at
                the application level.
              </p>
            </div>
          </section>

          {/* 3. How We Use Information */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              3. How We Use Information
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>We use collected information to:</p>
              <ul className="ml-6 list-disc space-y-2">
                <li>Provide and operate the Service</li>
                <li>Authenticate users and secure accounts</li>
                <li>Display user-created public pages</li>
                <li>Process subscriptions and manage billing status</li>
                <li>Monitor usage and performance of public pages</li>
                <li>
                  Detect, prevent, and respond to abuse, fraud, or technical
                  issues
                </li>
              </ul>
            </div>
          </section>

          {/* 4. Publicly Visible Information */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              4. Publicly Visible Information
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>
                Only content that a user explicitly publishes is publicly
                visible. Public information may include:
              </p>
              <ul className="ml-6 list-disc space-y-2">
                <li>Page title, bio, avatar image</li>
                <li>
                  Links, text blocks, headers, images, and other published
                  content
                </li>
                <li>Custom URL slug and SEO metadata</li>
              </ul>
              <p>
                Unpublished pages, dashboards, analytics, billing information,
                and account settings are private and accessible only to the
                authenticated user.
              </p>
            </div>
          </section>

          {/* 5. Cookies and Tracking Technologies */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              5. Cookies and Tracking Technologies
            </h2>

            <h3 className="mt-6 text-[17px] font-medium text-indigo">
              Essential Cookies
            </h3>
            <div className="mt-3 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>
                We use authentication cookies set by our authentication provider
                to keep users logged in. These cookies are:
              </p>
              <ul className="ml-6 list-disc space-y-2">
                <li>HTTP-only and secure</li>
                <li>Required for the Service to function</li>
              </ul>
            </div>

            <h3 className="mt-6 text-[17px] font-medium text-indigo">
              Analytics
            </h3>
            <div className="mt-3 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>
                We do not use analytics cookies, local storage or any other
                identifier stored on the visitor&apos;s device. Each analytics
                event is recorded on its own, with no visitor identity.
              </p>
              <p>
                We do not use advertising cookies or third-party tracking pixels.
              </p>
            </div>
          </section>

          {/* 6. Third-Party Service Providers */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              6. Third-Party Service Providers
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>
                We rely on the following third-party services to operate the
                Service:
              </p>
              <ul className="ml-6 list-disc space-y-2">
                <li>Neon (PostgreSQL database hosting)</li>
                <li>Cloudflare R2 (image and file storage)</li>
                <li>Google OAuth and GitHub OAuth (authentication)</li>
                <li>Emailit (transactional email delivery)</li>
                <li>Stripe (payment processing and billing)</li>
                <li>PostHog (analytics for public pages)</li>
                <li>Sentry (error monitoring and performance diagnostics)</li>
                <li>Upstash (rate limiting infrastructure)</li>
                <li>Google Safe Browsing (URL threat classification)</li>
                <li>Google Fonts (font delivery)</li>
                <li>Hosting provider (application hosting and network delivery)</li>
              </ul>
              <p>
                Each provider processes data according to its own privacy
                policies.
              </p>
            </div>
          </section>

          {/* 7. Payments and Billing Data */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              7. Payments and Billing Data
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>
                Payments are processed entirely by Stripe. We do not collect or
                store credit card numbers or payment credentials.
              </p>
              <p>
                We store limited billing-related information, including:
              </p>
              <ul className="ml-6 list-disc space-y-2">
                <li>Stripe customer ID</li>
                <li>Subscription status, plan, and billing period</li>
                <li>Workspace identifier associated with a subscription</li>
              </ul>
            </div>
          </section>

          {/* 8. Data Retention */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              8. Data Retention
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>
                We do not currently enforce a fixed data retention schedule.
              </p>
              <ul className="ml-6 list-disc space-y-2">
                <li>
                  Account data and user-generated content remain stored until
                  deleted by the user (where deletion is available)
                </li>
                <li>Verification tokens expire automatically</li>
                <li>Rate-limit data expires automatically</li>
                <li>
                  Analytics and error data retention is controlled by third-party
                  providers
                </li>
              </ul>
            </div>
          </section>

          {/* 9. Data Security */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              9. Data Security
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>
                We implement reasonable technical and organizational measures,
                including:
              </p>
              <ul className="ml-6 list-disc space-y-2">
                <li>HTTPS encryption for data in transit</li>
                <li>SSL-encrypted database connections</li>
                <li>Hashed password storage (bcrypt)</li>
                <li>
                  Authentication and authorization checks on all protected routes
                </li>
                <li>Server-side input validation and file upload controls</li>
                <li>Rate limiting on sensitive operations</li>
              </ul>
              <p>
                No method of transmission or storage is completely secure, and we
                cannot guarantee absolute security.
              </p>
            </div>
          </section>

          {/* 10. Your Rights and Choices */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              10. Your Rights and Choices
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-slate">
              <p>
                Depending on your location, you may have rights to:
              </p>
              <ul className="ml-6 list-disc space-y-2">
                <li>Access the personal information we hold about you</li>
                <li>Request correction of inaccurate information</li>
                <li>Request deletion of your personal information</li>
                <li>Opt out of certain data uses where applicable</li>
              </ul>
              <p>
                At this time, account deletion and data export tools are not
                implemented. Requests must be made by contacting us directly.
              </p>
            </div>
          </section>

          {/* 11. International Users */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              11. International Users
            </h2>
            <div className="mt-4 text-[15px] leading-relaxed text-slate">
              <p>
                LinkNest is operated from the United States. If you access the
                Service from outside the U.S., your information may be processed
                and stored in the United States or other jurisdictions where our
                service providers operate.
              </p>
            </div>
          </section>

          {/* 12. Changes to This Privacy Policy */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              12. Changes to This Privacy Policy
            </h2>
            <div className="mt-4 text-[15px] leading-relaxed text-slate">
              <p>
                We may update this Privacy Policy from time to time. Changes will
                be posted on this page with an updated effective date.
              </p>
            </div>
          </section>

          {/* 13. Contact Information */}
          <section className="mt-10">
            <h2 className="font-serif text-[22px] leading-[1.3] text-indigo">
              13. Contact Information
            </h2>
            <div className="mt-4 text-[15px] leading-relaxed text-slate">
              <p>
                For privacy-related questions or requests, contact us at{" "}
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
