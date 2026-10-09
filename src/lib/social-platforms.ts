import { z } from "zod";
import { normalizeUrl } from "@/lib/url";
import { normalizeHost } from "@/lib/link-farm";

/**
 * Platforms the social-icons block supports.
 *
 * Every web platform has a fixed set of hosts, and every http(s) icon must
 * resolve to one of them. That is deliberate: the link-farm check
 * (src/lib/link-farm-check.ts) only looks at link blocks, and these hosts are
 * all in its COMMON_LINK_HOSTS list, so restricting icons to them keeps that
 * check correct without teaching it to read block content. Arbitrary
 * "website" icons and Mastodon (whose instances are arbitrary domains) are
 * deferred until that policy exists; a Link block covers both meanwhile.
 *
 * Pure: imported by the editor (instant validation) and by the block actions
 * (authoritative validation) alike.
 */

type WebPlatform = {
  name: string;
  hosts: readonly string[];
  /** Build a profile URL from a handle. Absent = paste a link instead. */
  profile?: (handle: string) => string;
  handle?: RegExp;
  placeholder: string;
};

export const SOCIAL_PLATFORMS = {
  instagram: { name: "Instagram", hosts: ["instagram.com"], handle: /^[A-Za-z0-9._]{1,30}$/, profile: (h) => `https://www.instagram.com/${h}/`, placeholder: "@username" },
  x: { name: "X", hosts: ["x.com", "twitter.com"], handle: /^[A-Za-z0-9_]{1,15}$/, profile: (h) => `https://x.com/${h}`, placeholder: "@username" },
  tiktok: { name: "TikTok", hosts: ["tiktok.com"], handle: /^[A-Za-z0-9._]{2,24}$/, profile: (h) => `https://www.tiktok.com/@${h}`, placeholder: "@username" },
  youtube: { name: "YouTube", hosts: ["youtube.com", "youtu.be"], handle: /^[A-Za-z0-9._-]{3,30}$/, profile: (h) => `https://www.youtube.com/@${h}`, placeholder: "@channel" },
  linkedin: { name: "LinkedIn", hosts: ["linkedin.com"], handle: /^[A-Za-z0-9-]{3,100}$/, profile: (h) => `https://www.linkedin.com/in/${h}`, placeholder: "profile name, or paste a link" },
  threads: { name: "Threads", hosts: ["threads.net", "threads.com"], handle: /^[A-Za-z0-9._]{1,30}$/, profile: (h) => `https://www.threads.net/@${h}`, placeholder: "@username" },
  bluesky: { name: "Bluesky", hosts: ["bsky.app"], handle: /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/, profile: (h) => `https://bsky.app/profile/${h}`, placeholder: "name.bsky.social" },
  facebook: { name: "Facebook", hosts: ["facebook.com", "fb.com", "fb.me"], handle: /^[A-Za-z0-9.]{5,50}$/, profile: (h) => `https://www.facebook.com/${h}`, placeholder: "page name, or paste a link" },
  pinterest: { name: "Pinterest", hosts: ["pinterest.com", "pin.it"], handle: /^[A-Za-z0-9_]{3,30}$/, profile: (h) => `https://www.pinterest.com/${h}/`, placeholder: "username" },
  snapchat: { name: "Snapchat", hosts: ["snapchat.com"], handle: /^[A-Za-z][A-Za-z0-9._-]{2,14}$/, profile: (h) => `https://www.snapchat.com/add/${h}`, placeholder: "username" },
  twitch: { name: "Twitch", hosts: ["twitch.tv"], handle: /^[A-Za-z0-9_]{4,25}$/, profile: (h) => `https://www.twitch.tv/${h}`, placeholder: "channel" },
  discord: { name: "Discord", hosts: ["discord.gg", "discord.com"], placeholder: "paste an invite link" },
  telegram: { name: "Telegram", hosts: ["t.me", "telegram.me"], handle: /^[A-Za-z0-9_]{5,32}$/, profile: (h) => `https://t.me/${h}`, placeholder: "@username" },
  whatsapp: { name: "WhatsApp", hosts: ["wa.me", "whatsapp.com"], handle: /^\+?[0-9]{7,15}$/, profile: (h) => `https://wa.me/${h.replace(/^\+/, "")}`, placeholder: "phone number with country code" },
  github: { name: "GitHub", hosts: ["github.com"], handle: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, profile: (h) => `https://github.com/${h}`, placeholder: "username" },
  reddit: { name: "Reddit", hosts: ["reddit.com"], handle: /^[A-Za-z0-9_-]{3,20}$/, profile: (h) => `https://www.reddit.com/user/${h}`, placeholder: "username" },
  soundcloud: { name: "SoundCloud", hosts: ["soundcloud.com"], handle: /^[A-Za-z0-9_-]{3,25}$/, profile: (h) => `https://soundcloud.com/${h}`, placeholder: "username" },
  spotify: { name: "Spotify", hosts: ["spotify.com"], placeholder: "paste a Spotify link" },
  medium: { name: "Medium", hosts: ["medium.com"], handle: /^[A-Za-z0-9._]{1,30}$/, profile: (h) => `https://medium.com/@${h}`, placeholder: "@username" },
  patreon: { name: "Patreon", hosts: ["patreon.com"], handle: /^[A-Za-z0-9_]{1,64}$/, profile: (h) => `https://www.patreon.com/${h}`, placeholder: "creator name" },
} as const satisfies Record<string, WebPlatform>;

export type WebPlatformId = keyof typeof SOCIAL_PLATFORMS;
export type SocialPlatformId = WebPlatformId | "email" | "phone";

export const SOCIAL_PLATFORM_IDS: [SocialPlatformId, ...SocialPlatformId[]] = [
  "email",
  "phone",
  ...(Object.keys(SOCIAL_PLATFORMS) as WebPlatformId[]),
];

const CONTACT = {
  email: { name: "Email", placeholder: "name@example.com" },
  phone: { name: "Phone", placeholder: "+1 555 010 0000" },
} as const;

export function platformName(id: SocialPlatformId): string {
  return id === "email" || id === "phone" ? CONTACT[id].name : SOCIAL_PLATFORMS[id].name;
}

export function platformPlaceholder(id: SocialPlatformId): string {
  return id === "email" || id === "phone"
    ? CONTACT[id].placeholder
    : SOCIAL_PLATFORMS[id].placeholder;
}

function hostOf(url: URL): string {
  return normalizeHost(url.hostname).replace(/^(m|mobile)\./, "");
}

/** The platform a web URL belongs to, or null when its host is not supported. */
export function detectPlatform(url: URL): WebPlatformId | null {
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = hostOf(url);
  for (const [id, def] of Object.entries(SOCIAL_PLATFORMS) as [WebPlatformId, WebPlatform][]) {
    if (def.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return id;
  }
  return null;
}

export type SocialResolution =
  | { platform: SocialPlatformId; url: string }
  | { error: string };

const UNSUPPORTED =
  "Only the listed platforms are supported here. Use a Link block for other sites.";

function looksLikeUrl(input: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(input) || /^www\./i.test(input) || input.includes("/");
}

function fromUrl(raw: string): SocialResolution {
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  const normalized = normalizeUrl(candidate);
  if ("error" in normalized) return normalized;
  const url = new URL(normalized.url);
  if (url.protocol === "mailto:") return { platform: "email", url: normalized.url };
  if (url.protocol === "tel:") return { platform: "phone", url: normalized.url };
  const platform = detectPlatform(url);
  return platform ? { platform, url: normalized.url } : { error: UNSUPPORTED };
}

function fromEmail(raw: string): SocialResolution {
  const address = raw.replace(/^mailto:/i, "").trim();
  if (!z.email().safeParse(address).success) return { error: "Enter a valid email address." };
  const normalized = normalizeUrl(`mailto:${address}`);
  return "error" in normalized ? normalized : { platform: "email", url: normalized.url };
}

function fromPhone(raw: string): SocialResolution {
  const digits = raw.replace(/^tel:/i, "").replace(/[\s().-]/g, "");
  if (!/^\+?[0-9]{5,20}$/.test(digits)) return { error: "Enter a phone number, digits only." };
  const normalized = normalizeUrl(`tel:${digits}`);
  return "error" in normalized ? normalized : { platform: "phone", url: normalized.url };
}

/**
 * Turn what the owner typed into a platform and a URL.
 *
 * A pasted link wins over the chosen platform (its host decides), so pasting
 * an Instagram URL with "X" selected yields Instagram. Otherwise the input is
 * a handle for `platform`. Every result has passed normalizeUrl().
 */
export function resolveSocialInput(input: string, platform?: SocialPlatformId): SocialResolution {
  const raw = input.trim();
  if (!raw) return { error: "Enter a username or paste a link." };

  if (platform === "email") return fromEmail(raw);
  if (platform === "phone") return fromPhone(raw);
  if (/^mailto:/i.test(raw)) return fromEmail(raw);
  if (/^tel:/i.test(raw)) return fromPhone(raw);

  if (platform) {
    const def: WebPlatform = SOCIAL_PLATFORMS[platform];
    const handle =
      platform === "whatsapp" ? raw.replace(/[\s().-]/g, "") : raw.replace(/^@/, "");
    // Handles may contain dots (instagram, bluesky), so a bare "name.ext" is
    // tried as a handle before it is tried as a domain.
    if (def.profile && def.handle && !looksLikeUrl(raw) && def.handle.test(handle)) {
      const normalized = normalizeUrl(def.profile(handle));
      return "error" in normalized ? normalized : { platform, url: normalized.url };
    }
    if (!looksLikeUrl(raw) && !/^[\w-]+(\.[\w-]+)+$/.test(raw)) {
      return def.profile
        ? { error: `That doesn't look like a valid ${def.name} ${platform === "whatsapp" ? "number" : "username"}.` }
        : { error: `Paste your ${def.name} link.` };
    }
    return fromUrl(raw);
  }

  if (!looksLikeUrl(raw) && z.email().safeParse(raw).success) return fromEmail(raw);
  if (looksLikeUrl(raw) || /^[\w-]+(\.[\w-]+)+$/.test(raw)) return fromUrl(raw);
  return { error: "Choose a platform first, or paste a full link." };
}
