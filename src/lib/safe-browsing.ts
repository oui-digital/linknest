// src/lib/safe-browsing.ts — Google Safe Browsing Lookup API v4 integration

const API_KEY = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
const API_URL = "https://safebrowsing.googleapis.com/v4/threatMatches:find";
const TIMEOUT_MS = 2000;

// A missing key used to disable link scanning with no signal at all: checkUrls
// reports every URL safe and not timed out, so nothing is queued for the cron
// rescan either. Same treatment as a missing Upstash config in rate-limit.ts.
if (!API_KEY && process.env.NODE_ENV === "production") {
  console.error(
    "[safe-browsing] GOOGLE_SAFE_BROWSING_API_KEY is not set. " +
      "Link scanning is DISABLED and nothing is queued for rescan.",
  );
}

/**
 * Safe Browsing accepts only web URLs. A single mailto: or tel: entry makes
 * Google reject the whole request with 400 "Invalid URL", which this module
 * treats as a timeout: every link on a page with a phone number or email
 * address went live unscanned, and the cron rescan retried the same rejected
 * batch every night without ever draining the queue. Those schemes cannot
 * serve malware or a phishing page, so they are skipped rather than sent.
 */
function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

interface ThreatMatch {
  threatType: string;
  platformType: string;
  threat: { url: string };
  cacheDuration: string;
}

interface SafeBrowsingResponse {
  matches?: ThreatMatch[];
}

export interface SafeBrowsingResult {
  safe: boolean;
  flaggedUrls: string[];
  timedOut: boolean;
}

/**
 * Check a list of URLs against Google Safe Browsing.
 * Returns { safe: true } if all URLs pass, or { safe: false, flaggedUrls } if any fail.
 * On timeout or API error, returns { safe: true, timedOut: true } — fail-open.
 * Only http(s) URLs are sent; any other scheme counts as safe (see isWebUrl).
 */
export async function checkUrls(urls: string[]): Promise<SafeBrowsingResult> {
  if (!API_KEY || urls.length === 0) {
    return { safe: true, flaggedUrls: [], timedOut: false };
  }

  // Deduplicate and keep only the URLs Google will accept
  const uniqueUrls = [...new Set(urls.filter(isWebUrl))];
  if (uniqueUrls.length === 0) {
    return { safe: true, flaggedUrls: [], timedOut: false };
  }

  const body = {
    client: {
      clientId: "linknest",
      clientVersion: "1.0.0",
    },
    threatInfo: {
      threatTypes: [
        "MALWARE",
        "SOCIAL_ENGINEERING",
        "UNWANTED_SOFTWARE",
        "POTENTIALLY_HARMFUL_APPLICATION",
      ],
      platformTypes: ["ANY_PLATFORM"],
      threatEntryTypes: ["URL"],
      threatEntries: uniqueUrls.map((url) => ({ url })),
    },
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(
        "Safe Browsing API error:",
        response.status,
        await response.text(),
      );
      return { safe: true, flaggedUrls: [], timedOut: true };
    }

    const data = (await response.json()) as SafeBrowsingResponse;

    if (data.matches && data.matches.length > 0) {
      const flaggedUrls = data.matches.map((m) => m.threat.url);
      return { safe: false, flaggedUrls, timedOut: false };
    }

    return { safe: true, flaggedUrls: [], timedOut: false };
  } catch (error) {
    // Abort / timeout / network error → fail-open
    console.error("Safe Browsing check failed (fail-open):", error);
    return { safe: true, flaggedUrls: [], timedOut: true };
  }
}

// ─── URL Scheme Allowlist ───────────────────────────────────────────────────

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

export type UrlValidationResult = { url: string } | { error: string };

/**
 * Parse, validate and normalize a user-supplied URL.
 *
 * Returns the WHATWG-normalized href so that what we store is exactly what a
 * browser will resolve. A denylist cannot be used here: the URL parser strips
 * ASCII tab/LF/CR and leading whitespace before resolving the scheme, so
 * "java\tscript:alert(1)" resolves to javascript: while matching no anchored
 * pattern. Only an allowlist applied to the *parsed* protocol is sound.
 */
export function normalizeUrl(raw: string): UrlValidationResult {
  if (!raw || !raw.trim()) {
    return { error: "Enter a URL." };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { error: "Enter a full URL, including https://" };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return {
      error: "Only http, https, mailto and tel links are allowed.",
    };
  }

  return { url: parsed.href };
}
