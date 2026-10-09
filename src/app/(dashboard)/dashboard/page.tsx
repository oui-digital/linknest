import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserWorkspace, getWorkspacePages } from "@/lib/queries";
import { getPublicPageUrl } from "@/lib/slugs";
import { getLimit } from "@/lib/entitlements";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { AnalyticsCard } from "@/components/dashboard/analytics-card";
import { NewPageButton } from "@/components/dashboard/new-page-button";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const workspace = await getUserWorkspace(session.user.id);
  if (!workspace) {
    redirect("/onboarding");
  }

  const plan = workspace.plan as "free" | "pro";
  const pages = await getWorkspacePages(workspace.id);
  const maxPages = getLimit(plan, "max_pages");
  const canCreatePage = pages.length < maxPages;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-bold">LinkNest</h1>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/subscribers"
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              Subscribers
            </Link>
            <Link
              href="/dashboard/billing"
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              {plan === "pro" ? "Pro" : "Free"} plan
            </Link>
            <span className="text-sm text-gray-600">{session.user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Your Pages</h2>
            <p className="mt-1 text-sm text-gray-500">
              {pages.length}/{maxPages} page{maxPages !== 1 ? "s" : ""}
            </p>
          </div>
          <NewPageButton
            workspaceId={workspace.id}
            canCreate={canCreatePage}
          />
        </div>

        {/* Page cards */}
        <div className="space-y-4">
          {pages.map((page) => (
            <div
              key={page.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-6"
            >
              <div>
                <h3 className="font-medium">{page.title}</h3>
                <p className="mt-1 text-sm text-gray-500">
                  linknest.click{getPublicPageUrl(page.slug)}
                </p>
                <span
                  className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${page.isPublished
                      ? "bg-green-50 text-green-700"
                      : "bg-gray-100 text-gray-600"
                    }`}
                >
                  {page.isPublished ? "Published" : "Draft"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href={`/dashboard/editor/${page.id}`}
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                >
                  Edit
                </Link>
                {page.isPublished && (
                  <a
                    href={getPublicPageUrl(page.slug)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-50"
                  >
                    View
                  </a>
                )}
              </div>
            </div>
          ))}

          {/* Analytics */}
          {pages.length > 0 && (
            <div className="mt-8 space-y-4">
              {pages.map((page) => (
                <AnalyticsCard
                  key={page.id}
                  pageId={page.id}
                  slug={page.slug}
                  title={page.title}
                />
              ))}
            </div>
          )}

          {pages.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
              <p className="text-sm font-medium text-gray-700">
                You don&apos;t have a page yet
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Create one to claim your link and start adding blocks.
              </p>
              <Link
                href="/onboarding"
                className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
              >
                Create your page
              </Link>
            </div>
          )}
        </div>

        {/* Upgrade CTA for free users */}
        {plan === "free" && (
          <div className="mt-8 rounded-xl border border-gray-200 bg-gradient-to-r from-gray-900 to-gray-800 p-6 text-white">
            <h3 className="text-lg font-semibold">Upgrade to Pro</h3>
            <p className="mt-1 text-sm text-gray-300">
              Unlock premium templates, custom brand colors, 30+ fonts, up to 5
              pages, and advanced analytics.
            </p>
            <Link
              href="/pricing"
              className="mt-4 inline-block rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100"
            >
              See plans
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
