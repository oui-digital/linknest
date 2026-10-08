import { describe, it, expect, vi, afterEach } from "vitest";
import { normalizeUrl } from "./safe-browsing";

/**
 * These cases are the reason URL checking is an allowlist on the *parsed*
 * protocol rather than a set of anchored regexes. The WHATWG URL parser strips
 * ASCII tab/LF/CR and leading whitespace before resolving the scheme, so every
 * string below resolves to javascript:/data: in a browser while matching no
 * ^javascript:/^data: pattern. They were previously stored verbatim and
 * rendered straight into an <a href>, giving stored XSS on the app's origin.
 */
describe("normalizeUrl — dangerous scheme rejection", () => {
  const dangerous = [
    "javascript:alert(1)",
    " javascript:alert(1)",
    "\tjavascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "java\rscript:alert(1)",
    "JaVa\tScRiPt:alert(document.domain)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "da\tta:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "blob:https://example.com/uuid",
  ];

  for (const url of dangerous) {
    it(`rejects ${JSON.stringify(url)}`, () => {
      const result = normalizeUrl(url);
      expect(result, `${url} must not be accepted`).toHaveProperty("error");
    });
  }

  it("rejects every dangerous input that a browser would resolve to a script scheme", () => {
    for (const url of dangerous) {
      let protocol: string | null = null;
      try {
        protocol = new URL(url).protocol;
      } catch {
        protocol = null;
      }
      if (protocol === "javascript:" || protocol === "data:") {
        expect(normalizeUrl(url), url).toHaveProperty("error");
      }
    }
  });
});

describe("normalizeUrl — allowed schemes", () => {
  it("accepts http and https", () => {
    expect(normalizeUrl("https://example.com")).toEqual({
      url: "https://example.com/",
    });
    expect(normalizeUrl("http://example.com/path?q=1")).toEqual({
      url: "http://example.com/path?q=1",
    });
  });

  it("accepts mailto and tel", () => {
    expect(normalizeUrl("mailto:hi@example.com")).toEqual({
      url: "mailto:hi@example.com",
    });
    expect(normalizeUrl("tel:+15551234567")).toEqual({
      url: "tel:+15551234567",
    });
  });

  it("returns the normalized href, so what we store is what a browser resolves", () => {
    const result = normalizeUrl("  https://Example.com/a  ");
    expect(result).toHaveProperty("url");
    expect((result as { url: string }).url).toBe("https://example.com/a");
  });

  it("rejects input that is not a URL at all", () => {
    for (const input of ["", "   ", "example.com", "not a url"]) {
      expect(normalizeUrl(input), input).toHaveProperty("error");
    }
  });
});

/**
 * Google rejects a whole Safe Browsing request with 400 "Invalid URL" if any
 * entry is a mailto: or tel: link. That failed the scan open for every link on
 * the page and left the cron rescanning the same rejected batch every night.
 */
describe("checkUrls — schemes Safe Browsing rejects", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  // API_KEY is read when the module loads, so load a fresh copy with a key set.
  async function loadWithKey(fetchMock: typeof fetch) {
    vi.resetModules();
    vi.stubEnv("GOOGLE_SAFE_BROWSING_API_KEY", "test-key");
    vi.stubGlobal("fetch", fetchMock);
    return import("./safe-browsing");
  }

  it("sends only http and https URLs to Google", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("{}", { status: 200 }),
    );
    const { checkUrls } = await loadWithKey(fetchMock);

    const result = await checkUrls([
      "tel:+16195550100",
      "mailto:hello@example.com",
      "https://example.com/",
      "http://example.org/path?q=1",
      "https://example.com/",
    ]);

    expect(result).toEqual({ safe: true, flaggedUrls: [], timedOut: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(body.threatInfo.threatEntries).toEqual([
      { url: "https://example.com/" },
      { url: "http://example.org/path?q=1" },
    ]);
  });

  it("does not call Google for a page with only phone and email links", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    const { checkUrls } = await loadWithKey(fetchMock);

    const result = await checkUrls(["tel:+16195550100", "mailto:hello@example.com"]);

    expect(result).toEqual({ safe: true, flaggedUrls: [], timedOut: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
