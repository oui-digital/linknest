import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserWorkspace } from "@/lib/queries";
import { validateSlug, isReservedSlug, normalizeSlug } from "@/lib/slugs";
import { isSlugTaken } from "@/lib/queries";
import { db } from "@/lib/db";
import { insertPageInWorkspace } from "@/lib/page-create";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await getUserWorkspace(session.user.id);
  if (!workspace) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const { title, slug } = (await request.json()) as {
    title?: unknown;
    slug?: unknown;
  };

  // Validate inputs
  if (typeof title !== "string" || !title.trim() || title.length > 255) {
    return NextResponse.json({ error: "Invalid title" }, { status: 400 });
  }

  if (typeof slug !== "string") {
    return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  }

  // validateSlug returns a result object — it is always truthy, so it must be
  // read via .valid, never checked for truthiness.
  const slugCheck = validateSlug(slug);
  if (!slugCheck.valid) {
    return NextResponse.json({ error: slugCheck.reason }, { status: 400 });
  }

  // Persist the normalized form: lookups on the public route are
  // case-sensitive, so storing raw input would make the page unreachable.
  const normalizedSlug = normalizeSlug(slug);

  if (isReservedSlug(normalizedSlug)) {
    return NextResponse.json(
      { error: "This username is reserved" },
      { status: 400 },
    );
  }

  if (await isSlugTaken(normalizedSlug)) {
    return NextResponse.json(
      { error: "This username is already taken" },
      { status: 400 },
    );
  }

  try {
    // The page limit is enforced under the workspace lock, so a create racing
    // a duplicate cannot both pass at four of five pages.
    const result = await insertPageInWorkspace(db, {
      workspaceId: workspace.id,
      values: {
        slug: normalizedSlug,
        title: title.trim(),
        templateId: "clean-slate",
        theme: {},
      },
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 403 });
    }

    return NextResponse.json({ page: result.page });
  } catch {
    // Unique-constraint violation: someone claimed the slug between the
    // availability check and the insert.
    return NextResponse.json(
      { error: "This username is already taken" },
      { status: 409 },
    );
  }
}
