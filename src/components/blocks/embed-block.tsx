import type { InferSelectModel } from "drizzle-orm";
import type { blocks } from "@/lib/db/schema";
import { parseBlockContent } from "@/lib/blocks/content";
import { PROVIDER_NAMES, buildIframeSrc, type EmbedProvider } from "@/lib/embeds";
import { SITE_URL } from "@/lib/site";
import { EmbedFacade } from "./embed-facade";

type Block = InferSelectModel<typeof blocks>;

/**
 * Server half of an embed: rebuilds the iframe address from the stored
 * identifiers (never from stored URLs) and hands static props to the
 * click-to-load facade.
 */
export function EmbedBlock({ block, mode }: { block: Block; mode: "public" | "preview" }) {
  const content = parseBlockContent("embed", block.content);
  const embedDomain = new URL(SITE_URL).host;
  const embed =
    content.provider && content.embedId
      ? { provider: content.provider, embedId: content.embedId, kind: content.kind }
      : null;
  const src = embed ? buildIframeSrc(embed, { embedDomain }) : null;
  const autoplaySrc = embed ? buildIframeSrc(embed, { embedDomain, autoplay: true }) : null;

  if (!embed || !src || !autoplaySrc || !block.url) {
    if (mode === "public") return null;
    return (
      <div
        className="flex w-full items-center justify-center p-6 text-sm"
        style={{
          border: "1px dashed var(--ln-border-color)",
          borderRadius: "var(--ln-border-radius)",
          color: "var(--ln-color-text-muted)",
        }}
      >
        Paste a YouTube, Vimeo, Spotify or Calendly link
      </div>
    );
  }

  const provider = embed.provider as EmbedProvider;
  return (
    <EmbedFacade
      blockId={block.id}
      provider={provider}
      providerName={PROVIDER_NAMES[provider]}
      title={block.label || PROVIDER_NAMES[provider]}
      canonicalUrl={block.url}
      coverUrl={content.coverUrl ?? null}
      aspect={content.aspect ?? "16:9"}
      autoplaySrc={autoplaySrc}
    />
  );
}
