import { describe, it, expect } from "vitest";
import { USER_LINK_REL, isExternalPage } from "./link-rel";

/**
 * Every link block used to render target="_blank" unconditionally. For a tel:
 * link — which a local business page will have — that hands off to the dialer
 * while leaving a blank tab behind, and on desktop it is just a dead tab.
 */
describe("link block target behaviour", () => {
  it("opens web destinations in a new tab", () => {
    for (const url of [
      "https://oui.digital/pricing/",
      "http://example.com",
      "HTTPS://EXAMPLE.COM",
      "https://tidycal.com/ouidigitalstudio/website-teardown",
    ]) {
      expect(isExternalPage(url), url).toBe(true);
    }
  });

  it("keeps app handoffs in the same tab", () => {
    for (const url of ["tel:+16192590530", "mailto:hi@oui.digital"]) {
      expect(isExternalPage(url), url).toBe(false);
    }
  });

  it("does not treat a lookalike scheme as a web page", () => {
    // normalizeUrl() already blocks these, but the target rule must not be the
    // thing that lets one through.
    for (const url of ["javascript:alert(1)", "data:text/html,x"]) {
      expect(isExternalPage(url), url).toBe(false);
    }
  });
});

describe("user link rel", () => {
  const tokens = USER_LINK_REL.split(" ");

  it("does not pass ranking signals to user-supplied destinations", () => {
    expect(tokens).toContain("nofollow");
    expect(tokens).toContain("ugc");
  });

  it("keeps rel=me so Mastodon profile verification still works", () => {
    expect(tokens).toContain("me");
  });

  it("keeps the tab-isolation tokens", () => {
    expect(tokens).toContain("noopener");
    expect(tokens).toContain("noreferrer");
  });
});
