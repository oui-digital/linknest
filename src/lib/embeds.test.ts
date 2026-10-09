import { describe, it, expect } from "vitest";
import { EMBED_FRAME_HOSTS, buildIframeSrc, parseEmbedUrl } from "./embeds";

const YT = "dQw4w9WgXcQ";
const SP = "4uLU6hMCjMI75M1A2tKUQC";

describe("parseEmbedUrl", () => {
  it.each([
    [`https://youtu.be/${YT}?t=10`, "youtube", YT, "16:9"],
    [`https://www.youtube.com/watch?v=${YT}&list=PL123`, "youtube", YT, "16:9"],
    [`https://m.youtube.com/watch?v=${YT}`, "youtube", YT, "16:9"],
    [`https://www.youtube-nocookie.com/embed/${YT}`, "youtube", YT, "16:9"],
    [`youtube.com/shorts/${YT}`, "youtube", YT, "9:16"],
    ["https://vimeo.com/76979871", "vimeo", "76979871", "16:9"],
    ["https://player.vimeo.com/video/76979871", "vimeo", "76979871", "16:9"],
    [`https://open.spotify.com/intl-fr/track/${SP}?si=abc`, "spotify", SP, "compact"],
    [`https://open.spotify.com/playlist/${SP}`, "spotify", SP, "square"],
    ["https://calendly.com/acme/intro-call", "calendly", "acme/intro-call", "tall"],
    ["https://calendly.com/acme", "calendly", "acme", "tall"],
  ])("%s", (url, provider, embedId, aspect) => {
    expect(parseEmbedUrl(url)).toMatchObject({ provider, embedId, aspect });
  });

  it("canonicalises the stored link", () => {
    expect(parseEmbedUrl(`https://youtu.be/${YT}?t=10`)).toMatchObject({
      canonicalUrl: `https://www.youtube.com/watch?v=${YT}`,
    });
    expect(parseEmbedUrl(`https://open.spotify.com/intl-fr/track/${SP}?si=abc`)).toMatchObject({
      canonicalUrl: `https://open.spotify.com/track/${SP}`,
      kind: "track",
    });
  });

  it.each([
    `https://evil.example/watch?v=${YT}`,
    "https://www.youtube.com/watch?v=short",
    `https://youtube.com.evil.example/watch?v=${YT}`,
    "https://open.spotify.com/podcast/abc",
    `https://open.spotify.com/track/${SP}x`,
    "https://calendly.com/a/b/c",
    "https://vimeo.com/channels/staffpicks",
    `javascript:alert("${YT}")`,
  ])("rejects %s", (url) => {
    expect(parseEmbedUrl(url)).toHaveProperty("error");
  });
});

describe("buildIframeSrc", () => {
  const opts = { embedDomain: "www.linknest.click" };

  it("only ever produces allowlisted frame hosts", () => {
    const srcs = [
      buildIframeSrc({ provider: "youtube", embedId: YT }, opts),
      buildIframeSrc({ provider: "vimeo", embedId: "76979871" }, opts),
      buildIframeSrc({ provider: "spotify", embedId: SP, kind: "album" }, opts),
      buildIframeSrc({ provider: "calendly", embedId: "acme/intro" }, opts),
    ];
    for (const src of srcs) {
      expect(src).not.toBeNull();
      expect(EMBED_FRAME_HOSTS.some((h) => src!.startsWith(`${h}/`))).toBe(true);
    }
  });

  it("refuses tampered stored identifiers", () => {
    expect(buildIframeSrc({ provider: "youtube", embedId: "x/../../evil" }, opts)).toBeNull();
    expect(buildIframeSrc({ provider: "spotify", embedId: SP, kind: "evil" }, opts)).toBeNull();
    expect(buildIframeSrc({ provider: "calendly", embedId: "a?b=c" }, opts)).toBeNull();
    expect(buildIframeSrc({ provider: "iframe", embedId: "https://evil" }, opts)).toBeNull();
  });

  it("adds autoplay where the provider supports it", () => {
    expect(buildIframeSrc({ provider: "youtube", embedId: YT }, { ...opts, autoplay: true })).toContain("autoplay=1");
  });
});
