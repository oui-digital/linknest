import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getUserWorkspace, getWorkspacePages } from "@/lib/queries";
import { getLimit, type PlanId } from "@/lib/entitlements";
import { AnalyticsPanel } from "@/components/dashboard/analytics-panel";

export const metadata = { title: "Analytics — LinkNest" };

export default async function PageAnalytics({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const workspace = await getUserWorkspace(session.user.id);
  if (!workspace) redirect("/onboarding");

  const { pageId } = await params;
  const page = (await getWorkspacePages(workspace.id)).find((p) => p.id === pageId);
  if (!page) notFound();

  const plan = workspace.plan as PlanId;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-800">
            &larr; Dashboard
          </Link>
          <h1 className="truncate text-lg font-bold">
            Analytics <span className="font-normal text-gray-400">@{page.slug}</span>
          </h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">
        <AnalyticsPanel
          slug={page.slug}
          maxDays={getLimit(plan, "analytics_days")}
          isPro={plan === "pro"}
        />
      </main>
    </div>
  );
}
