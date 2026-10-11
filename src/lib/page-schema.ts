import { z } from "zod";
import { isOwnAssetUrl } from "@/lib/assets";
import { LANGUAGE_CODES } from "@/lib/languages";

/**
 * Input schema for updatePage (src/lib/actions/page.ts).
 *
 * Lives outside the action module: a "use server" file may only export async
 * functions, so the schema could not be exported from there for tests.
 */

export const ENTITY_KINDS = ["person", "organization"] as const;
export type EntityKindInput = (typeof ENTITY_KINDS)[number];

export const AVATAR_ALT_MAX = 255;

// Images a page shows must be our own R2 objects: they are never Safe-Browsing
// scanned, so a third-party URL would be an unscanned destination and a free
// tracking pixel on every visit. "" clears the field.
const ownImageUrl = z
  .string()
  .max(2048)
  .refine((url) => isOwnAssetUrl(url), "Images must be uploaded to LinkNest")
  .or(z.literal(""));

export const updatePageSchema = z.object({
  pageId: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: ownImageUrl.optional(),
  avatarAlt: z.string().max(AVATAR_ALT_MAX).optional(),
  templateId: z.string().max(63).optional(),
  seoTitle: z.string().max(70).optional(),
  seoDescription: z.string().max(160).optional(),
  language: z.enum(LANGUAGE_CODES).optional(),
  entityKind: z.enum(ENTITY_KINDS).optional(),
  ogImageUrl: ownImageUrl.optional(),
  faviconUrl: ownImageUrl.optional(),
});

export type UpdatePageInput = z.infer<typeof updatePageSchema>;
