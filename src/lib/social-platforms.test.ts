import { describe, it, expect } from "vitest";
import { detectPlatform, resolveSocialInput } from "./social-platforms";

const ok = (input: string, platform?: Parameters<typeof resolveSocialInput>[1]) => {
  const r = resolveSocialInput(input, platform);
  if ("error" in r) throw new Error(`expected success for ${input}: ${r.error}`);
  return r;
};

describe("detectPlatform", () => {
  it.each([
    ["https://x.com/natgeo", "x"],
    ["https://twitter.com/natgeo", "x"],
    ["https://mobile.twitter.com/natgeo", "x"],
    ["https://www.instagram.com/natgeo/", "instagram"],
    ["https://youtu.be/dQw4w9WgXcQ", "youtube"],
    ["https://m.youtube.com/@natgeo", "youtube"],
    ["https://www.threads.net/@natgeo", "threads"],
    ["https://bsky.app/profile/natgeo.bsky.social", "bluesky"],
    ["https://open.spotify.com/artist/abc", "spotify"],
    ["https://uk.linkedin.com/in/someone", "linkedin"],
  ])("%s → %s", (url, platform) => {
    expect(detectPlatform(new URL(url))).toBe(platform);
  });

  it("rejects unknown hosts, lookalikes and Mastodon instances", () => {
    expect(detectPlatform(new URL("https://example.com/"))).toBeNull();
    expect(detectPlatform(new URL("https://instagram.com.evil.example/"))).toBeNull();
    expect(detectPlatform(new URL("https://notinstagram.com/"))).toBeNull();
    expect(detectPlatform(new URL("https://mastodon.social/@someone"))).toBeNull();
  });
});

describe("resolveSocialInput", () => {
  it("builds a profile URL from a handle, stripping @", () => {
    expect(ok("@natgeo", "x")).toEqual({ platform: "x", url: "https://x.com/natgeo" });
    expect(ok("natgeo", "tiktok").url).toBe("https://www.tiktok.com/@natgeo");
  });

  it("accepts handles that contain dots", () => {
    expect(ok("nat.geo", "instagram").url).toBe("https://www.instagram.com/nat.geo/");
    expect(ok("natgeo.bsky.social", "bluesky").url).toBe("https://bsky.app/profile/natgeo.bsky.social");
  });

  it("lets a pasted link decide the platform", () => {
    expect(ok("https://www.instagram.com/natgeo", "x").platform).toBe("instagram");
    expect(ok("instagram.com/natgeo").url).toBe("https://instagram.com/natgeo");
  });

  it("turns phone numbers into wa.me and tel: links", () => {
    expect(ok("+44 7700 900123", "whatsapp").url).toBe("https://wa.me/447700900123");
    expect(ok("+1 (555) 010-0000", "phone")).toEqual({ platform: "phone", url: "tel:+15550100000" });
  });

  it("recognises email addresses", () => {
    expect(ok("hello@example.com")).toEqual({ platform: "email", url: "mailto:hello@example.com" });
    expect(ok("hello@example.com", "email").platform).toBe("email");
  });

  it("rejects invalid handles with a platform-specific message", () => {
    const r = resolveSocialInput("not a handle!", "instagram");
    expect(r).toEqual({ error: "That doesn't look like a valid Instagram username." });
  });

  it("rejects unsupported hosts, Mastodon and dangerous schemes", () => {
    expect("error" in resolveSocialInput("https://example.com/me")).toBe(true);
    expect("error" in resolveSocialInput("@me@mastodon.social")).toBe(true);
    expect("error" in resolveSocialInput("javascript:alert(1)")).toBe(true);
    expect("error" in resolveSocialInput("java\tscript:alert(1)", "x")).toBe(true);
  });

  it("asks for a link on URL-only platforms", () => {
    expect(resolveSocialInput("mychannel", "discord")).toEqual({ error: "Paste your Discord link." });
    expect(ok("https://discord.gg/abc123", "discord").platform).toBe("discord");
  });
});
