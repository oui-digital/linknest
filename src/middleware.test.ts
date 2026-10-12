import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The Auth.js wrapper only decorates the request with `req.auth`; none of the
// public-page branches read it, so the handler is called straight through.
vi.mock("@/lib/auth", () => ({ auth: (handler: unknown) => handler }));

import middleware from "./middleware";

type Handler = (req: NextRequest) => Response | Promise<Response>;

async function run(url: string): Promise<Response> {
  return (middleware as unknown as Handler)(new NextRequest(url));
}

const ORIGIN = "https://www.linknest.click";

describe("middleware: public page URLs", () => {
  it("rewrites a lowercase handle to the page route without redirecting", async () => {
    const res = await run(`${ORIGIN}/@ouidigital?utm_source=x`);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBe(`${ORIGIN}/ouidigital?utm_source=x`);
  });

  // Regression: /@OuiDigital rendered the page with a 200, giving every page
  // as many URLs as there are capitalisations of its handle.
  it("308s a mixed-case handle to the lowercase canonical, keeping the query", async () => {
    const res = await run(`${ORIGIN}/@OuiDigital?utm_source=x`);
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/@ouidigital?utm_source=x`);
  });

  it("lowercases only the handle on a sub-path", async () => {
    const res = await run(`${ORIGIN}/@OuiDigital/og?v=1`);
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/@ouidigital/og?v=1`);
  });

  // Regression: `new URL(path, req.url)` dropped the query string, and 301
  // let a mixed-case bare path need a second hop.
  it("308s a bare slug to /@slug, lowercased, keeping the query", async () => {
    const res = await run(`${ORIGIN}/OuiDigital?a=1`);
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/@ouidigital?a=1`);
  });

  it("sends app-route handles to the 404 instead of a page lookup", async () => {
    for (const path of ["/@dashboard", "/@Dashboard", "/@report/abc", "/@api/x", "/@features", "/@Features/email-capture", "/@opengraph-image"]) {
      const res = await run(`${ORIGIN}${path}`);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("x-middleware-rewrite"), path).toBe(`${ORIGIN}/not-found`);
    }
  });

  it("leaves the root, nested paths and static assets alone", async () => {
    for (const path of ["/", "/foo/bar", "/linknest-logo.svg", "/pricing", "/features", "/features/email-capture", "/opengraph-image"]) {
      const res = await run(`${ORIGIN}${path}`);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("location"), path).toBeNull();
      expect(res.headers.get("x-middleware-rewrite"), path).toBeNull();
    }
  });
});
