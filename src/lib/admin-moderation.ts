import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { pages, users } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { normalizeSlug } from "@/lib/slugs";
import {
  ADMIN_TAKEDOWN_SOURCE,
  HOLD_REASONS,
  REINSTATE_ALL,
} from "@/lib/moderation";
import {
  reinstateOwnedPages,
  reinstatePage,
  takedownOwnedPages,
  takedownPage,
  workspaceOwnerEmails,
  type ModerationDeps,
} from "@/lib/moderation-actions";

const pageTarget = {
  pageId: z.string().uuid().optional(),
  slug: z.string().min(1).max(63).optional(),
};
const userTarget = {
  userId: z.string().uuid().optional(),
  email: z.string().email().max(255).optional(),
};
const reason = z.string().max(1000).optional();

export const moderationCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("takedown_page"), ...pageTarget, reason }),
  z.object({
    action: z.literal("reinstate_page"),
    ...pageTarget,
    // Which hold to lift. No default: reinstating the wrong hold (or all of
    // them) by accident would quietly re-enable a banned page.
    reasonCode: z.enum([...HOLD_REASONS, REINSTATE_ALL]),
    reason,
  }),
  z.object({ action: z.literal("suspend_user"), ...userTarget, reason }),
  z.object({ action: z.literal("reinstate_user"), ...userTarget, reason }),
]);

export type ModerationCommand = z.infer<typeof moderationCommandSchema>;

export type AdminDeps = ModerationDeps & {
  notifyOwner: (notice: { to: string; slug: string; reasonCode: string }) => Promise<void>;
};

export type CommandResult =
  | { status: 400 | 404; error: string }
  | { status: 200; body: Record<string, unknown> };

async function resolvePageId(
  db: Db,
  target: { pageId?: string; slug?: string },
): Promise<string | null | "ambiguous"> {
  if (Boolean(target.pageId) === Boolean(target.slug)) return "ambiguous";
  const [row] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(
      target.pageId
        ? eq(pages.id, target.pageId)
        : eq(pages.slug, normalizeSlug(target.slug!)),
    )
    .limit(1);
  return row?.id ?? null;
}

async function resolveUserId(
  db: Db,
  target: { userId?: string; email?: string },
): Promise<string | null | "ambiguous"> {
  if (Boolean(target.userId) === Boolean(target.email)) return "ambiguous";
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      target.userId
        ? eq(users.id, target.userId)
        : eq(users.email, target.email!.trim().toLowerCase()),
    )
    .limit(1);
  return row?.id ?? null;
}

/**
 * Execute one admin moderation command. The route handles authentication and
 * JSON parsing; everything else lives here so it can be tested against a real
 * database.
 */
export async function runModerationCommand(
  db: Db,
  command: ModerationCommand,
  deps: AdminDeps,
): Promise<CommandResult> {
  switch (command.action) {
    case "takedown_page": {
      const pageId = await resolvePageId(db, command);
      if (pageId === "ambiguous") return { status: 400, error: "Provide exactly one of pageId or slug." };
      if (!pageId) return { status: 404, error: "Page not found." };

      const result = await takedownPage(
        db,
        pageId,
        { reasonCode: "manual_review", source: ADMIN_TAKEDOWN_SOURCE, details: command.reason },
        deps,
      );
      if (!result.found) return { status: 404, error: "Page not found." };

      let ownersNotified = 0;
      if (result.changed) {
        for (const to of await workspaceOwnerEmails(db, result.page.workspaceId)) {
          try {
            await deps.notifyOwner({ to, slug: result.page.slug, reasonCode: "manual_review" });
            ownersNotified++;
          } catch (error) {
            console.error("[admin] Owner notice failed:", error);
          }
        }
      }
      return {
        status: 200,
        body: {
          slug: result.page.slug,
          changed: result.changed,
          wasPublished: result.wasPublished,
          ownersNotified,
        },
      };
    }

    case "reinstate_page": {
      const pageId = await resolvePageId(db, command);
      if (pageId === "ambiguous") return { status: 400, error: "Provide exactly one of pageId or slug." };
      if (!pageId) return { status: 404, error: "Page not found." };

      const result = await reinstatePage(db, pageId, {
        reasonCode: command.reasonCode,
        source: ADMIN_TAKEDOWN_SOURCE,
        details: command.reason,
      });
      if (!result.found) return { status: 404, error: "Page not found." };
      return {
        status: 200,
        body: {
          slug: result.page.slug,
          changed: result.changed,
          remainingHolds: result.remainingHolds,
        },
      };
    }

    case "suspend_user": {
      const userId = await resolveUserId(db, command);
      if (userId === "ambiguous") return { status: 400, error: "Provide exactly one of userId or email." };
      if (!userId) return { status: 404, error: "User not found." };

      // Keep the original suspension time on a repeat call. The jwt callback
      // in src/lib/auth.ts drops existing sessions within five minutes.
      await db
        .update(users)
        .set({ suspendedAt: sql`COALESCE(${users.suspendedAt}, now())` })
        .where(eq(users.id, userId));

      // No per-page owner emails: this is an account-level action.
      const pagesAffected = await takedownOwnedPages(
        db,
        userId,
        { reasonCode: "account_suspended", source: ADMIN_TAKEDOWN_SOURCE, details: command.reason },
        deps,
      );
      return { status: 200, body: { userId, pages: pagesAffected } };
    }

    case "reinstate_user": {
      const userId = await resolveUserId(db, command);
      if (userId === "ambiguous") return { status: 400, error: "Provide exactly one of userId or email." };
      if (!userId) return { status: 404, error: "User not found." };

      await db.update(users).set({ suspendedAt: null }).where(eq(users.id, userId));
      // Lifts only the suspension hold. A page that was also banned by hand
      // stays blocked, and nothing is republished automatically.
      const pagesAffected = await reinstateOwnedPages(db, userId, {
        source: ADMIN_TAKEDOWN_SOURCE,
        details: command.reason,
      });
      return { status: 200, body: { userId, pages: pagesAffected } };
    }
  }
}
