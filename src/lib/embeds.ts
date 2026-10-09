import { normalizeHost } from "@/lib/link-farm";
import { normalizeUrl } from "@/lib/url";

/**
 * Media embeds from a pasted link, for an allowlist of providers.
 *
 * Only identifiers are stored (provider, id, kind). The iframe address is
 * rebuilt from them at render time from fixed templates, so nothing a page
 * owner stores can make the page frame an arbitrary site.
 */

export const EMBED_PROVIDERS = ["youtube", "vimeo", "spotify", "calendly"] as const;
export type EmbedProvider = (typeof EMBED_PROVIDERS)[number];

export const SPOTIFY_KINDS = ["track", "album", "playlist", "episode", "show", "artist"] as const;
export type SpotifyKind = (typeof SPOTIFY_KINDS)[number];

export type EmbedAspect = "16:9" | "9:16" | "compact" | "tall" | "square";

export type ParsedEmbed = {
  provider: EmbedProvider;
  embedId: string;
  kind?: SpotifyKind;
  canonicalUrl: string;
  aspect: EmbedAspect;
};

export const PROVIDER_NAMES: Record<EmbedProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  spotify: "Spotify",
  calendly: "Calendly",
};

export const EMBED_UNSUPPORTED = "Paste a YouTube, Vimeo, Spotify or Calendly link.";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const CALENDLY_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

function host(url: URL): string {
  return normalizeHost(url.hostname).replace(/^(m|music)\./, "");
}

function youtube(url: URL): ParsedEmbed | null {
  const h = host(url);
  let id: string | null = null;
  let shorts = false;
  if (h === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (h === "youtube.com" || h === "youtube-nocookie.com") {
    const [, first, second] = url.pathname.split("/");
    if (first === "watch") id = url.searchParams.get("v");
    else if (first === "shorts") {
      id = second ?? null;
      shorts = true;
    } else if (first === "live" || first === "embed") id = second ?? null;
  }
  if (!id || !YOUTUBE_ID.test(id)) return null;
  return {
    provider: "youtube",
    embedId: id,
    canonicalUrl: shorts ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
    aspect: shorts ? "9:16" : "16:9",
  };
}

function vimeo(url: URL): ParsedEmbed | null {
  const h = host(url);
  const parts = url.pathname.split("/").filter(Boolean);
  let id: string | undefined;
  if (h === "vimeo.com") id = parts.find((p) => /^\d+$/.test(p));
  else if (h === "player.vimeo.com" && parts[0] === "video") id = parts[1];
  if (!id || !/^\d{1,12}$/.test(id)) return null;
  return { provider: "vimeo", embedId: id, canonicalUrl: `https://vimeo.com/${id}`, aspect: "16:9" };
}

function spotify(url: URL): ParsedEmbed | null {
  if (host(url) !== "open.spotify.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0]?.startsWith("intl-")) parts.shift();
  if (parts[0] === "embed") parts.shift();
  const [kind, id] = parts;
  if (!(SPOTIFY_KINDS as readonly string[]).includes(kind ?? "") || !id || !SPOTIFY_ID.test(id)) {
    return null;
  }
  return {
    provider: "spotify",
    embedId: id,
    kind: kind as SpotifyKind,
    canonicalUrl: `https://open.spotify.com/${kind}/${id}`,
    aspect: kind === "track" || kind === "episode" ? "compact" : "square",
  };
}

function calendly(url: URL): ParsedEmbed | null {
  if (host(url) !== "calendly.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 1 || parts.length > 2 || !parts.every((p) => CALENDLY_SEGMENT.test(p))) {
    return null;
  }
  const path = parts.join("/");
  return { provider: "calendly", embedId: path, canonicalUrl: `https://calendly.com/${path}`, aspect: "tall" };
}

/** Parse a pasted link into an embed, or say which links are supported. */
export function parseEmbedUrl(raw: string): ParsedEmbed | { error: string } {
  const trimmed = raw.trim();
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const normalized = normalizeUrl(candidate);
  if ("error" in normalized) return { error: EMBED_UNSUPPORTED };
  const url = new URL(normalized.url);
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: EMBED_UNSUPPORTED };
  return youtube(url) ?? vimeo(url) ?? spotify(url) ?? calendly(url) ?? { error: EMBED_UNSUPPORTED };
}

/**
 * The iframe address for a stored embed, from fixed templates only. Returns
 * null when the stored identifiers do not validate (never trust stored data
 * to be well formed).
 */
export function buildIframeSrc(
  embed: { provider: string; embedId: string; kind?: string },
  { autoplay = false, embedDomain }: { autoplay?: boolean; embedDomain: string },
): string | null {
  switch (embed.provider) {
    case "youtube":
      if (!YOUTUBE_ID.test(embed.embedId)) return null;
      return `https://www.youtube-nocookie.com/embed/${embed.embedId}${autoplay ? "?autoplay=1" : ""}`;
    case "vimeo":
      if (!/^\d{1,12}$/.test(embed.embedId)) return null;
      return `https://player.vimeo.com/video/${embed.embedId}?dnt=1${autoplay ? "&autoplay=1" : ""}`;
    case "spotify":
      if (!SPOTIFY_ID.test(embed.embedId) || !(SPOTIFY_KINDS as readonly string[]).includes(embed.kind ?? "")) {
        return null;
      }
      return `https://open.spotify.com/embed/${embed.kind}/${embed.embedId}`;
    case "calendly": {
      const parts = embed.embedId.split("/");
      if (parts.length < 1 || parts.length > 2 || !parts.every((p) => CALENDLY_SEGMENT.test(p))) return null;
      return `https://calendly.com/${embed.embedId}?embed_type=Inline&embed_domain=${encodeURIComponent(embedDomain)}&hide_gdpr_banner=1`;
    }
    default:
      return null;
  }
}

/** Frame hosts a future Content-Security-Policy must allow in frame-src. */
export const EMBED_FRAME_HOSTS = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
  "https://open.spotify.com",
  "https://calendly.com",
];
