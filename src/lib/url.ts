/**
 * URL scheme allowlist. Pure: safe to import from client components.
 */

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
