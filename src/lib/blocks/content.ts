import { z } from "zod";
import { SOCIAL_PLATFORM_IDS } from "@/lib/social-platforms";

/**
 * Block types and the shape of each type's `content` payload.
 *
 * `blocks.content` is an untyped jsonb column that the block components render
 * straight into JSX, so its shape has to be closed: a non-string landing in a
 * text slot throws during SSR and takes down the whole public page. There are
 * two schemas per type:
 *
 *   - writers (`z.strictObject`) reject unknown keys, so neither the editor
 *     nor a direct action call can persist a field the renderers do not
 *     understand;
 *   - readers (`z.object`) strip unknown keys and salvage whatever validates,
 *     so a legacy or hand-edited row never blanks a block at render time.
 *
 * The editor derives every edit from `parseBlockContent()`, which is why saves
 * only ever carry known keys. `styleOverrides` is additionally shape- and
 * plan-checked by validateStyleOverrides() in src/lib/actions/block-validation.ts.
 */

export const BLOCK_TYPES = ["link", "header", "text", "divider", "image", "socials"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
export const blockTypeSchema = z.enum(BLOCK_TYPES);

export function isBlockType(type: string): type is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(type);
}

const styleOverridesShape = {
  variant: z.string().max(32).optional(),
  bgColor: z.string().max(32).optional(),
  textColor: z.string().max(32).optional(),
  borderRadius: z.number().optional(),
  shadow: z.string().max(16).optional(),
  buttonStyle: z.string().max(32).optional(),
};

const linkShape = {};
const headerShape = {};
const textShape = { text: z.string().max(5000).optional() };
const dividerShape = {};
const imageShape = {
  imageUrl: z.string().max(2048).optional(),
  alt: z.string().max(255).optional(),
};

export const MAX_SOCIAL_ITEMS = 20;

export const socialItemSchema = z.strictObject({
  platform: z.enum(SOCIAL_PLATFORM_IDS),
  url: z.string().min(1).max(2048),
  label: z.string().max(40).optional(),
});
export type SocialItem = z.infer<typeof socialItemSchema>;

// Reading keeps every valid icon and drops only the invalid ones, so one bad
// entry cannot empty the whole row.
const socialItemsReader = z
  .array(z.unknown())
  .transform((items) =>
    items.flatMap((item) => {
      const parsed = socialItemSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  );

const readStyle = { styleOverrides: z.object(styleOverridesShape).optional() };
const writeStyle = { styleOverrides: z.strictObject(styleOverridesShape).optional() };

/** Lenient: unknown keys are dropped. For reading stored rows. */
export const blockContentReaders = {
  link: z.object({ ...linkShape, ...readStyle }),
  header: z.object({ ...headerShape, ...readStyle }),
  text: z.object({ ...textShape, ...readStyle }),
  divider: z.object({ ...dividerShape, ...readStyle }),
  image: z.object({ ...imageShape, ...readStyle }),
  socials: z.object({ items: socialItemsReader.optional(), ...readStyle }),
};

/** Strict: unknown keys are rejected. For validating writes. */
export const blockContentWriters = {
  link: z.strictObject({ ...linkShape, ...writeStyle }),
  header: z.strictObject({ ...headerShape, ...writeStyle }),
  text: z.strictObject({ ...textShape, ...writeStyle }),
  divider: z.strictObject({ ...dividerShape, ...writeStyle }),
  image: z.strictObject({ ...imageShape, ...writeStyle }),
  socials: z.strictObject({
    items: z.array(socialItemSchema).max(MAX_SOCIAL_ITEMS).optional(),
    ...writeStyle,
  }),
};

export type BlockContent<T extends BlockType> = z.infer<(typeof blockContentReaders)[T]>;
export type AnyBlockContent = Record<string, unknown>;

/** The writer for a type known only at runtime. */
export function blockContentWriterFor(type: BlockType): z.ZodType<AnyBlockContent> {
  return blockContentWriters[type] as unknown as z.ZodType<AnyBlockContent>;
}

/**
 * Read a stored `content` value. Never throws and never returns less than the
 * valid part of what is stored: a whole-object parse is tried first, then each
 * known field on its own, so one bad value cannot blank its neighbours.
 * Unknown block types and non-object values read as `{}`.
 */
export function parseBlockContent<T extends BlockType>(type: T, raw: unknown): BlockContent<T>;
export function parseBlockContent(type: string, raw: unknown): AnyBlockContent;
export function parseBlockContent(type: string, raw: unknown): AnyBlockContent {
  if (!isBlockType(type)) return {};
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const schema = blockContentReaders[type];
  const whole = schema.safeParse(source);
  if (whole.success) return whole.data as AnyBlockContent;

  const salvaged: AnyBlockContent = {};
  for (const [key, fieldSchema] of Object.entries(schema.shape)) {
    if (!(key in source)) continue;
    const field = (fieldSchema as z.ZodType).safeParse(source[key]);
    if (field.success && field.data !== undefined) salvaged[key] = field.data;
  }
  return salvaged;
}
