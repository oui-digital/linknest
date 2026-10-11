import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserWorkspace } from "@/lib/queries";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { absoluteUrl } from "@/lib/site";
import Link from "next/link";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const workspace = await getUserWorkspace(session.user.id);
  if (!workspace) redirect("/onboarding");

  const params = await searchParams;
  const showSuccess = params.success === "true";
  const showCanceled = params.canceled === "true";

  // Get subscription info
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspace.id))
    .limit(1);

  // Build Stripe Customer Portal URL if they have a customer ID
  let portalUrl: string | null = null;
  let portalUnavailable = false;
  if (workspace.stripeCustomerId) {
    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: workspace.stripeCustomerId,
        // absoluteUrl, not a bare process.env.AUTH_URL — unset, that produced
        // the literal return URL "undefined/dashboard/billing".
        return_url: absoluteUrl("/dashboard/billing"),
      });
      portalUrl = portalSession.url;
    } catch (error) {
      // The portal is the ONLY cancel path in the app, so a failure here has
      // to be visible rather than silently hiding the button.
      console.error("[billing] Stripe portal session failed:", error);
      portalUnavailable = true;
    }
  }

  const isActive =
    sub?.status === "active" ||
    sub?.status === "trialing" ||
    sub?.status === "past_due";

  // The webhook may not have landed yet when Stripe redirects back, so the
  // success banner must not claim Pro is live while the badge still says Free.
  const upgradePending = showSuccess && workspace.plan !== "pro";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              &larr; Dashboard
            </Link>
            <h1 className="text-lg font-bold">Billing</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {/* Success / Cancel banners */}
        {showSuccess &&
          (upgradePending ? (
            <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              Payment received — we&apos;re activating your Pro features now.
              This usually takes a few seconds.{" "}
              <Link href="/dashboard/billing" className="font-medium underline">
                Refresh
              </Link>
            </div>
          ) : (
            <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              Your subscription is active! You now have access to all Pro
              features.
            </div>
          ))}
        {showCanceled && (
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            Checkout was canceled. No charges were made.
          </div>
        )}

        {/* Current plan */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {workspace.plan === "pro" ? "Pro Plan" : "Free Plan"}
              </h2>
              {isActive && sub && (
                <p className="mt-1 text-sm text-gray-500">
                  {sub.cancelAtPeriodEnd
                    ? `Cancels on ${sub.currentPeriodEnd.toLocaleDateString()}`
                    : `Renews on ${sub.currentPeriodEnd.toLocaleDateString()}`}
                </p>
              )}
              {!isActive && (
                <p className="mt-1 text-sm text-gray-500">
                  Upgrade to unlock premium templates, custom colors, more pages,
                  and advanced analytics.
                </p>
              )}
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                workspace.plan === "pro"
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {workspace.plan === "pro" ? "Pro" : "Free"}
            </span>
          </div>

          <div className="mt-6 flex gap-3">
            {workspace.plan !== "pro" && (
              <Link
                href="/pricing"
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
              >
                Upgrade to Pro
              </Link>
            )}
            {portalUrl && (
              <a
                href={portalUrl}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-50"
              >
                Manage Subscription
              </a>
            )}
          </div>

          {sub?.status === "past_due" && (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Your last payment failed. Update your card to keep Pro — we&apos;ll
              keep retrying in the meantime.
            </p>
          )}

          {portalUnavailable && (
            <p className="mt-4 text-sm text-gray-500">
              Subscription management is temporarily unavailable. Email{" "}
              <a
                href="mailto:support@linknest.click"
                className="underline hover:text-gray-700"
              >
                support@linknest.click
              </a>{" "}
              and we&apos;ll take care of it.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
