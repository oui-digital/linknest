import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUserWorkspace, getWorkspacePages } from "@/lib/queries";
import { getLimit, hasFeature, type PlanId } from "@/lib/entitlements";
import { countConfirmed, listSubscribers } from "@/lib/subscribers";
import { SubscriberTable } from "@/components/dashboard/subscriber-table";

export const metadata = { title: "Subscribers — LinkNest" };

export default async function SubscribersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const workspace = await getUserWorkspace(session.user.id);
  if (!workspace) redirect("/onboarding");

  const plan = workspace.plan as PlanId;
  const pages = await getWorkspacePages(workspace.id);
  const { page: selected } = await searchParams;
  const pageId = pages.some((p) => p.id === selected) ? selected : undefined;

  const [rows, confirmed] = await Promise.all([
    listSubscribers(db, { workspaceId: workspace.id, pageId }),
    countConfirmed(db, workspace.id),
  ]);
  const limit = getLimit(plan, "max_subscribers");
  const canExport = hasFeature(plan, "subscriber_export");
  const atCap = Number.isFinite(limit) && confirmed >= limit;
  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-800">
              &larr; Dashboard
            </Link>
            <h1 className="text-lg font-bold">Subscribers</h1>
          </div>
          {canExport ? (
            <a
              href={`/api/subscribers/export${pageId ? `?pageId=${pageId}` : ""}`}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
            >
              Export CSV
            </a>
          ) : (
            <Link
              href="/pricing"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-400"
              title="CSV export is included with Pro"
            >
              Export CSV
              <span className="rounded bg-gray-900 px-1 text-[9px] font-semibold text-white">PRO</span>
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <section className="flex flex-wrap items-baseline gap-x-8 gap-y-2 rounded-xl border border-gray-200 bg-white p-6">
          <div>
            <p className="text-xs text-gray-500">Confirmed (all pages)</p>
            <p className="text-2xl font-bold">
              {confirmed.toLocaleString()}
              {Number.isFinite(limit) && <span className="text-base font-normal text-gray-400"> / {limit}</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Awaiting confirmation{pageId ? " (this page)" : ""}</p>
            <p className="text-2xl font-bold">{pending.toLocaleString()}</p>
          </div>
          {atCap && (
            <p className="w-full rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {confirmed} of {limit} confirmed subscribers: new sign-ups are paused.{" "}
              <Link href="/pricing" className="font-medium underline">
                Upgrade for unlimited
              </Link>
            </p>
          )}
        </section>

        {pages.length > 1 && (
          <nav className="flex flex-wrap gap-2" aria-label="Filter by page">
            <Link
              href="/dashboard/subscribers"
              className={`rounded-lg border px-3 py-1.5 text-xs ${!pageId ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white"}`}
            >
              All pages
            </Link>
            {pages.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/subscribers?page=${p.id}`}
                className={`rounded-lg border px-3 py-1.5 text-xs ${pageId === p.id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white"}`}
              >
                @{p.slug}
              </Link>
            ))}
          </nav>
        )}

        <SubscriberTable
          rows={rows.map((r) => ({
            id: r.id,
            email: r.email,
            status: r.status,
            pageSlug: r.pageSlug,
            date: (r.confirmedAt ?? r.requestedAt).toISOString(),
          }))}
        />

        <p className="text-xs leading-relaxed text-gray-400">
          Each page has its own list; people join only the list of the page they signed up on.
          Unconfirmed requests are deleted after 7 days. Unsubscribed addresses stay visible for 30 days,
          then are deleted. You are responsible for how you contact your subscribers.
        </p>
      </main>
    </div>
  );
}
