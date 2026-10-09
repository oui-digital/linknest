import sharp from "sharp";
import type { ParsedEmbed } from "@/lib/embeds";

/**
 * Title and cover image for a new embed, fetched once when the owner pastes
 * the link. Never fatal: any failure just means no title or no cover.
 *
 * This is a server-side fetch driven by user input, so every request is
 * constrained (OWASP SSRF guidance):
 *   - the oEmbed endpoints are fixed per provider and receive only our own
 *     canonical URL, never the pasted one;
 *   - the YouTube cover address is built from the validated video id; for
 *     Vimeo and Spotify the returned thumbnail_url is used only if it is
 *     https on that provider's image hosts;
 *   - redirects are refused, every response body is size-capped while it is
 *     read, images must declare an image content type and decode to at most
 *     4096×4096 before they are re-encoded and stored as our own asset.
 *
 * Visitors therefore never load a third-party image before choosing to play.
 */

export const OEMBED_MAX_BYTES = 64 * 1024;
export const COVER_MAX_BYTES = 2 * 1024 * 1024;
export const COVER_MAX_DIMENSION = 4096;
const TIMEOUT_MS = 3000;

const OEMBED_ENDPOINTS: Partial<Record<ParsedEmbed["provider"], (url: string) => string>> = {
  youtube: (url) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
  vimeo: (url) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
  spotify: (url) => `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
};

const COVER_HOSTS: Partial<Record<ParsedEmbed["provider"], readonly string[]>> = {
  vimeo: ["i.vimeocdn.com"],
  spotify: ["i.scdn.co", "mosaic.scdn.co", "image-cdn-ak.spotifycdn.com", "image-cdn-fa.spotifycdn.com"],
};

type FetchImpl = typeof fetch;

/** Read at most `limit` bytes of a response body; null if it is larger. */
async function readCapped(res: Response, limit: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!res.body) return null;

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function get(url: string, fetchImpl: FetchImpl): Promise<Response | null> {
  try {
    const res = await fetchImpl(url, {
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "LinkNest embed preview" },
    });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

/** An allowed cover address for this embed, or null. */
export function coverUrlFor(embed: ParsedEmbed, thumbnailUrl: unknown): string | null {
  if (embed.provider === "youtube") return `https://i.ytimg.com/vi/${embed.embedId}/hqdefault.jpg`;
  const hosts = COVER_HOSTS[embed.provider];
  if (!hosts || typeof thumbnailUrl !== "string") return null;
  try {
    const url = new URL(thumbnailUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    return hosts.includes(url.hostname.toLowerCase()) ? url.href : null;
  } catch {
    return null;
  }
}

export async function fetchEmbedMetadata(
  embed: ParsedEmbed,
  { fetchImpl = fetch }: { fetchImpl?: FetchImpl } = {},
): Promise<{ title?: string; cover?: Buffer }> {
  const result: { title?: string; cover?: Buffer } = {};

  let thumbnailUrl: unknown;
  const endpoint = OEMBED_ENDPOINTS[embed.provider];
  if (endpoint) {
    const res = await get(endpoint(embed.canonicalUrl), fetchImpl);
    const body = res ? await readCapped(res, OEMBED_MAX_BYTES).catch(() => null) : null;
    if (body) {
      try {
        const data = JSON.parse(new TextDecoder().decode(body)) as { title?: unknown; thumbnail_url?: unknown };
        if (typeof data.title === "string" && data.title.trim()) {
          result.title = data.title.trim().slice(0, 255);
        }
        thumbnailUrl = data.thumbnail_url;
      } catch {
        // not JSON: no title
      }
    }
  }

  const coverUrl = coverUrlFor(embed, thumbnailUrl);
  if (coverUrl) {
    const res = await get(coverUrl, fetchImpl);
    if (res && /^image\//i.test(res.headers.get("content-type") ?? "")) {
      const bytes = await readCapped(res, COVER_MAX_BYTES).catch(() => null);
      if (bytes) {
        try {
          const buffer = Buffer.from(bytes);
          const meta = await sharp(buffer).metadata();
          if (
            meta.width && meta.height &&
            meta.width <= COVER_MAX_DIMENSION && meta.height <= COVER_MAX_DIMENSION
          ) {
            result.cover = buffer;
          }
        } catch {
          // undecodable: no cover
        }
      }
    }
  }

  return result;
}
