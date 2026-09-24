"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { pages, pageModerationLog } from "@/lib/db/schema";
import { eq, and, or, desc } from "drizzle-orm";
import { getUserWorkspace } from "@/lib/queries";
import { publicPageTag } from "@/lib/cache-tags";
import { checkUrls } from "@/lib/safe-browsing";
import { publishPageCore } from "@/lib/publish";
import { scheduleLinkFarmCheck } from "@/lib/link-farm-check";
import { checkRateLimit, mutationRateLimit } from "@/lib/rate-limit";
import type { ThemeTokens } from "@/lib/templates/theme";
import {
  COLOR_PALETTES,
  SYSTEM_FONTS,
  FREE_BUTTON_STYLES,
} from "@/lib/templates/theme";
import { getTemplate } from "@/lib/templates";
import { hasFeature, type PlanId } from "@/lib/entitlements";
import {
  ADMIN_TAKEDOWN_SOURCE,
  MODERATION_BLOCKED_ERROR,
  isBlockedByModeration,
} from "@/lib/moderation";

// ─── Validation Schemas ─────────────────────────────────────────────────────

// Theme tokens are interpolated into CSS custom properties and rendered into a
// style attribute on the public page. React does not sanitize custom-property
// values, so an unvalidated value containing ";" injects sibling declarations —
// which is enough to hide the "Made with LinkNest" badge (a paid feature) or
// restyle the page arbitrarily. Every field is therefore closed and bounded,
// and unknown keys are rejected outright.
const CSS_COLOR_RE =
  /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|transparent)$/;

const colorToken = z.string().max(64).regex(CSS_COLOR_RE, "Invalid color");
// Font stacks are user-selectable but must not carry punctuation that could
// terminate a declaration.
const fontToken = z
  .string()
  .max(120)
  .regex(/^[\w\s,'"-]+$/, "Invalid font");

const themeTokensSchema = z
  .object({
    version: z.literal(1).optional(),

    colorBackground: colorToken.optional(),
    colorSurface: colorToken.optional(),
    colorPrimary: colorToken.optional(),
    colorSecondary: colorToken.optional(),
    colorText: colorToken.optional(),
    colorTextMuted: colorToken.optional(),
    colorAccent: colorToken.optional(),
    borderColor: colorToken.optional(),

    fontHeading: fontToken.optional(),
    fontBody: fontToken.optional(),
    fontSizeBase: z.number().int().min(10).max(32).optional(),
    fontWeightHeading: z.number().int().min(100).max(900).optional(),
    lineHeightBody: z.number().min(1).max(3).optional(),

    spacingUnit: z.number().int().min(2).max(32).optional(),
    contentMaxWidth: z.number().int().min(280).max(1200).optional(),
    blockGap: z.number().int().min(0).max(64).optional(),
    pagePaddingX: z.number().int().min(0).max(128).optional(),
    pagePaddingY: z.number().int().min(0).max(256).optional(),

    // 999 is the "fully rounded / pill" idiom used by several templates.
    borderRadius: z.number().int().min(0).max(999).optional(),
    borderWidth: z.number().int().min(0).max(16).optional(),

    buttonStyle: z
      .enum([
        "filled",
        "outline",
        "ghost",
        "pill",
        "shadow",
        "neon",
        "glass",
        "minimal",
      ])
      .optional(),
    buttonRadius: z.number().int().min(0).max(999).optional(),
    buttonPaddingX: z.number().int().min(0).max(64).optional(),
    buttonPaddingY: z.number().int().min(0).max(64).optional(),

    shadow: z.enum(["none", "sm", "md", "lg"]).optional(),
    backgroundEffect: z.enum(["none", "gradient", "pattern", "blur"]).optional(),
    // Restricted to gradient functions: this value lands in `background-image`,
    // where a url() would let a page owner beacon every visitor to a third party.
    backgroundGradient: z
      .string()
      .max(512)
      .regex(
        /^(linear|radial|conic)-gradient\([^;{}()]*(\([^;{}()]*\)[^;{}()]*)*\)$/,
        "Invalid gradient",
      )
      .optional(),

    hideBranding: z.boolean().optional(),
  })
  .strict();

const updatePageSchema = z.object({
  pageId: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().max(2048).optional().or(z.literal("")),
  templateId: z.string().max(63).optional(),
  seoTitle: z.string().max(70).optional(),
  seoDescription: z.string().max(160).optional(),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function verifyPageOwnership(pageId: string, userId: string) {
  const workspace = await getUserWorkspace(userId);
  if (!workspace) return null;

  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.workspaceId, workspace.id)))
    .limit(1);

  if (!page) return null;

  return { page, workspace };
}

// ─── Update Page Settings ───────────────────────────────────────────────────

export async function updatePage(input: z.infer<typeof updatePageSchema>) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const rl = await checkRateLimit(mutationRateLimit, session.user.id);
  if (!rl.success) return { error: "Too many requests. Please slow down." };

  const parsed = updatePageSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const result = await verifyPageOwnership(parsed.data.pageId, session.user.id);
  if (!result) {
    return { error: "Page not found" };
  }

  const { page, workspace } = result;

  // Gate: Premium templates
  if (parsed.data.templateId !== undefined) {
    const template = getTemplate(parsed.data.templateId);
    if (
      template.tier === "pro" &&
      !hasFeature(workspace.plan as PlanId, "premium_templates")
    ) {
      return { error: "Premium templates require a Pro plan" };
    }
  }

  const { pageId, ...updates } = parsed.data;
  const cleanUpdates: Record<string, unknown> = { updatedAt: new Date() };

  if (updates.title !== undefined) cleanUpdates.title = updates.title;
  if (updates.bio !== undefined) cleanUpdates.bio = updates.bio || null;
  if (updates.avatarUrl !== undefined)
    cleanUpdates.avatarUrl = updates.avatarUrl || null;
  if (updates.templateId !== undefined)
    cleanUpdates.templateId = updates.templateId;
  if (updates.seoTitle !== undefined)
    cleanUpdates.seoTitle = updates.seoTitle || null;
  if (updates.seoDescription !== undefined)
    cleanUpdates.seoDescription = updates.seoDescription || null;

  const [updated] = await db
    .update(pages)
    .set(cleanUpdates)
    .where(eq(pages.id, pageId))
    .returning();

  revalidatePath(`/${page.slug}`);
  revalidateTag(publicPageTag(page.slug), "max");

  return { page: updated };
}

// ─── Update Theme ───────────────────────────────────────────────────────────

export async function updateTheme(pageId: string, theme: Partial<ThemeTokens>) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const rl = await checkRateLimit(mutationRateLimit, session.user.id);
  if (!rl.success) return { error: "Too many requests. Please slow down." };

  if (typeof pageId !== "string" || !z.string().uuid().safeParse(pageId).success) {
    return { error: "Invalid input" };
  }

  const parsedTheme = themeTokensSchema.safeParse(theme);
  if (!parsedTheme.success) {
    return { error: "Invalid theme value" };
  }

  const result = await verifyPageOwnership(pageId, session.user.id);
  if (!result) {
    return { error: "Page not found" };
  }

  const { page, workspace } = result;
  const plan = workspace.plan as PlanId;
  theme = parsedTheme.data as Partial<ThemeTokens>;

  // Gate 1: Custom hex colors
  if (!hasFeature(plan, "custom_colors")) {
    const colorFields = [
      "colorBackground",
      "colorSurface",
      "colorPrimary",
      "colorSecondary",
      "colorText",
      "colorTextMuted",
      "colorAccent",
      "borderColor",
    ] as const;
    const allowedColors = new Set(
      COLOR_PALETTES.flatMap((p) => Object.values(p.colors)),
    );
    for (const field of colorFields) {
      if (theme[field] && !allowedColors.has(theme[field])) {
        return {
          error: "Custom colors require a Pro plan. Choose a curated palette.",
        };
      }
    }
  }

  // Gate 2: Google Fonts
  if (!hasFeature(plan, "google_fonts")) {
    const systemFontValues = new Set(SYSTEM_FONTS.map((f) => f.value));
    for (const field of ["fontHeading", "fontBody"] as const) {
      if (theme[field] && !systemFontValues.has(theme[field])) {
        return { error: "Google Fonts require a Pro plan" };
      }
    }
  }

  // Gate 3: Pro button styles
  if (!hasFeature(plan, "animated_buttons") && theme.buttonStyle) {
    const freeStyles: string[] = [...FREE_BUTTON_STYLES];
    if (!freeStyles.includes(theme.buttonStyle)) {
      return { error: "This button style requires a Pro plan" };
    }
  }

  // Gate 4: Remove badge
  if (theme.hideBranding === true && !hasFeature(plan, "remove_badge")) {
    return { error: "Removing the badge requires a Pro plan" };
  }

  // Merge with existing theme
  const currentTheme = (page.theme ?? {}) as Partial<ThemeTokens>;
  const mergedTheme = { ...currentTheme, ...theme, version: 1 };

  const [updated] = await db
    .update(pages)
    .set({ theme: mergedTheme, updatedAt: new Date() })
    .where(eq(pages.id, pageId))
    .returning();

  revalidatePath(`/${page.slug}`);
  revalidateTag(publicPageTag(page.slug), "max");

  return { page: updated };
}

// ─── Reset Theme ─────────────────────────────────────────────────────────────

export async function resetTheme(pageId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const result = await verifyPageOwnership(pageId, session.user.id);
  if (!result) {
    return { error: "Page not found" };
  }

  const { page } = result;

  const [updated] = await db
    .update(pages)
    .set({ theme: {}, updatedAt: new Date() })
    .where(eq(pages.id, pageId))
    .returning();

  revalidatePath(`/${page.slug}`);
  revalidateTag(publicPageTag(page.slug), "max");

  return { page: updated };
}

// ─── Publish Page ───────────────────────────────────────────────────────────

export async function publishPage(pageId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const result = await verifyPageOwnership(pageId, session.user.id);
  if (!result) {
    return { error: "Page not found" };
  }

  const { page } = result;

  // An admin takedown stands until the page is explicitly reinstated.
  const [latestTakedown] = await db
    .select({
      action: pageModerationLog.action,
      source: pageModerationLog.source,
    })
    .from(pageModerationLog)
    .where(
      and(
        eq(pageModerationLog.pageId, pageId),
        or(
          eq(pageModerationLog.action, "reinstated"),
          and(
            eq(pageModerationLog.action, "unpublished"),
            eq(pageModerationLog.source, ADMIN_TAKEDOWN_SOURCE),
          ),
        ),
      ),
    )
    .orderBy(desc(pageModerationLog.createdAt))
    .limit(1);

  if (isBlockedByModeration(latestTakedown)) {
    return { error: MODERATION_BLOCKED_ERROR };
  }

  try {
    // Scans every link, then publishes only if nothing changed since the scan
    // (see src/lib/live-edit.ts for why that check is needed).
    const result = await publishPageCore(db, pageId, { checkUrls });
    if (!result.ok) {
      return result.flaggedUrls
        ? { error: result.error, flaggedUrls: result.flaggedUrls }
        : { error: result.error };
    }

    // Revalidate the public page cache (use internal path without @)
    revalidatePath(`/${page.slug}`);
    revalidateTag(publicPageTag(page.slug), "max");
    scheduleLinkFarmCheck(pageId);

    return { page: result.page };
  } catch (error) {
    // Publishing is the single most important action in the product, and an
    // exception here previously reached the user as a bare "Something went
    // wrong" with no server-side record of what failed.
    console.error("[publishPage] Failed:", { pageId, slug: page.slug }, error);
    Sentry.captureException(error, {
      tags: { action: "publishPage" },
      extra: { pageId, slug: page.slug },
    });
    return {
      error: "Couldn't publish your page. Please try again in a moment.",
    };
  }
}

// ─── Unpublish Page ─────────────────────────────────────────────────────────

export async function unpublishPage(pageId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const result = await verifyPageOwnership(pageId, session.user.id);
  if (!result) {
    return { error: "Page not found" };
  }

  const { page } = result;

  const [updated] = await db
    .update(pages)
    .set({
      isPublished: false,
      updatedAt: new Date(),
    })
    .where(eq(pages.id, pageId))
    .returning();

  // Revalidate the public page cache
  revalidatePath(`/${page.slug}`);
  revalidateTag(publicPageTag(page.slug), "max");

  return { page: updated };
}
