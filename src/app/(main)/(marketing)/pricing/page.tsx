import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getUserWorkspace } from "@/lib/queries";
import { SITE_URL } from "@/lib/site";
import { PricingCards } from "./pricing-cards";

export const metadata: Metadata = {
  title: "LinkNest Pricing | Free and Pro Link-in-Bio Pages",
  description: "Start with a free link-in-bio page. Compare LinkNest Free and Pro for pages, design, email sign-ups and analytics.",
  alternates: { canonical: `${SITE_URL}/pricing` },
  openGraph: { title: "LinkNest Pricing | Free and Pro", description: "See what you can build for free and when to grow with Pro.", url: `${SITE_URL}/pricing` },
  twitter: { card: "summary_large_image" },
};

export default async function PricingPage() {
  const session = await auth();
  const workspace = session?.user?.id ? await getUserWorkspace(session.user.id) : null;
  const currentPlan = workspace?.plan === "pro" ? "pro" : workspace ? "free" : null;

  return (
    <main className="bg-cloud px-5 pb-24 pt-32 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-coral">Pricing</p>
          <h1 className="mt-4 font-serif text-[clamp(38px,5vw,60px)] leading-tight text-indigo">Start free. Grow on your terms.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate">Share rich content, collect email sign-ups, and see what gets clicks. Choose Pro when you need more pages, longer reporting and full brand control.</p>
        </div>
        <PricingCards currentPlan={currentPlan} />
        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-slate">Pro is billed immediately when you choose to upgrade. You can cancel anytime. After your paid period and a seven-day grace period, only your oldest published page remains live on Free; other pages stay as drafts.</p>
      </div>
    </main>
  );
}
