import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserWorkspace } from "@/lib/queries";
import Link from "next/link";
import { PricingCards } from "./pricing-cards";

export default async function PricingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const workspace = await getUserWorkspace(session.user.id);
  if (!workspace) redirect("/onboarding");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              &larr; Dashboard
            </Link>
            <h1 className="text-lg font-bold">LinkNest</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold">Upgrade to Pro</h2>
          <p className="mt-2 text-gray-500">
            Unlock premium templates, custom brand colors, more pages, and
            advanced analytics.
          </p>
        </div>

        <PricingCards currentPlan={workspace.plan as "free" | "pro"} />
      </main>
    </div>
  );
}
