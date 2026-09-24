import { describe, it, expect } from "vitest";
import {
  LINK_FARM_MAX_HOSTS,
  LINK_FARM_MIN_WORKSPACES,
  extractLinkHosts,
  normalizeHost,
  worstSharedHost,
} from "./link-farm";

describe("extractLinkHosts", () => {
  it("keeps web hosts, lowercased, without www", () => {
    expect(
      extractLinkHosts(["https://WWW.Casino-Example.com/promo?x=1", "http://pills.example/"]),
    ).toEqual(["casino-example.com", "pills.example"]);
  });

  it("dedupes the same host across links", () => {
    expect(
      extractLinkHosts(["https://spam.example/a", "https://www.spam.example/b"]),
    ).toEqual(["spam.example"]);
  });

  it("ignores tel:, mailto: and unparseable values", () => {
    expect(extractLinkHosts(["tel:+15555550100", "mailto:a@b.co", "not a url"])).toEqual([]);
  });

  it("drops destinations that every legitimate page shares", () => {
    expect(
      extractLinkHosts([
        "https://instagram.com/someone",
        "https://www.youtube.com/@someone",
        "https://open.spotify.com/artist/1",
      ]),
    ).toEqual([]);
  });

  it("resolves userinfo tricks to the real host", () => {
    expect(extractLinkHosts(["https://instagram.com@casino.example/"])).toEqual([
      "casino.example",
    ]);
  });

  it("caps the number of hosts per page", () => {
    const urls = Array.from({ length: 50 }, (_, i) => `https://host${i}.example/`);
    expect(extractLinkHosts(urls)).toHaveLength(LINK_FARM_MAX_HOSTS);
  });
});

describe("normalizeHost", () => {
  it("strips a trailing dot", () => {
    expect(normalizeHost("Casino.Example.")).toBe("casino.example");
  });
});

describe("worstSharedHost", () => {
  it("flags a single host shared by enough other workspaces", () => {
    expect(worstSharedHost({ "casino.example": LINK_FARM_MIN_WORKSPACES })).toEqual({
      host: "casino.example",
      workspaces: LINK_FARM_MIN_WORKSPACES,
    });
  });

  it("does not add counts across hosts", () => {
    expect(worstSharedHost({ "a.example": 2, "b.example": 2, "c.example": 2 })).toBeNull();
  });

  it("returns the most shared host when several qualify", () => {
    expect(worstSharedHost({ "a.example": 6, "b.example": 9 }, 5)).toEqual({
      host: "b.example",
      workspaces: 9,
    });
  });
});
