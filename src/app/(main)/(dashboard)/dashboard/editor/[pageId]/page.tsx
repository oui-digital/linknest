import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { pages, blocks } from "@/lib/db/schema";
import { eq, asc, and } from "drizzle-orm";
import { getUserWorkspace } from "@/lib/queries";
import { EditorShell } from "@/components/editor/editor-shell";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const workspace = await getUserWorkspace(session.user.id);
  if (!workspace) {
    redirect("/onboarding");
  }

  const { pageId } = await params;

  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.workspaceId, workspace.id)))
    .limit(1);

  if (!page) {
    notFound();
  }

  const pageBlocks = await db
    .select()
    .from(blocks)
    .where(eq(blocks.pageId, page.id))
    .orderBy(asc(blocks.position));

  return (
    <EditorShell
      page={page}
      initialBlocks={pageBlocks}
      plan={workspace.plan as "free" | "pro"}
    />
  );
}
