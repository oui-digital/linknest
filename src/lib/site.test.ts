import { describe, it, expect } from "vitest";
import { publicPageUrlVariants, resolveSiteUrl, siteOriginVariants } from "./site";

describe("siteOriginVariants", () => {
  it("pairs a www origin with its apex, canonical first", () => {
    expect(siteOriginVariants("https://www.linknest.click")).toEqual([
      "https://www.linknest.click",
      "https://linknest.click",
    ]);
  });

  it("pairs an apex origin with its www form", () => {
    expect(siteOriginVariants("https://linknest.click")).toEqual([
      "https://linknest.click",
      "https://www.linknest.click",
    ]);
  });

  it("keeps the scheme and port", () => {
    expect(siteOriginVariants("http://localhost:3000")).toEqual([
      "http://localhost:3000",
      "http://www.localhost:3000",
    ]);
  });
});

describe("publicPageUrlVariants", () => {
  // Analytics events recorded before the www switch carry the apex URL.
  it("covers both hosts with and without a trailing slash", () => {
    const urls = publicPageUrlVariants("ouidigital", "https://www.linknest.click");
    expect(urls).toHaveLength(4);
    expect(urls).toContain("https://www.linknest.click/@ouidigital");
    expect(urls).toContain("https://www.linknest.click/@ouidigital/");
    expect(urls).toContain("https://linknest.click/@ouidigital");
    expect(urls).toContain("https://linknest.click/@ouidigital/");
  });
});

describe("resolveSiteUrl", () => {
  it("prefers the explicit public origin and strips a trailing slash", () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: "https://www.linknest.click/",
        AUTH_URL: "https://other.example",
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "www.linknest.click",
      }),
    ).toBe("https://www.linknest.click");
  });

  it("falls back to AUTH_URL before anything Vercel provides", () => {
    expect(
      resolveSiteUrl({ AUTH_URL: "https://auth.example", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "prod.example" }),
    ).toBe("https://auth.example");
  });

  it("uses the production domain only on production deployments", () => {
    expect(
      resolveSiteUrl({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "www.linknest.click" }),
    ).toBe("https://www.linknest.click");
  });

  // Regression: a Preview without an explicit origin used to generate
  // production links in its emails and metadata.
  it("never falls back to the production domain on a preview", () => {
    expect(
      resolveSiteUrl({
        VERCEL_ENV: "preview",
        VERCEL_PROJECT_PRODUCTION_URL: "www.linknest.click",
        VERCEL_BRANCH_URL: "linknest-git-feat-x.vercel.app",
        VERCEL_URL: "linknest-abc123.vercel.app",
      }),
    ).toBe("https://linknest-git-feat-x.vercel.app");
  });

  it("uses the deployment URL on a preview without a branch alias", () => {
    expect(
      resolveSiteUrl({ VERCEL_ENV: "preview", VERCEL_URL: "linknest-abc123.vercel.app" }),
    ).toBe("https://linknest-abc123.vercel.app");
  });

  it("falls back to localhost for development and unknown environments", () => {
    expect(resolveSiteUrl({})).toBe("http://localhost:3000");
    expect(
      resolveSiteUrl({ VERCEL_ENV: "development", VERCEL_PROJECT_PRODUCTION_URL: "www.linknest.click", VERCEL_URL: "localhost:3000" }),
    ).toBe("http://localhost:3000");
  });
});
