import { describe, it, expect } from "vitest";
import {
  clientConfigFor,
  evaluateSiteverifyResult,
  parseAllowedHostnames,
  resolveTurnstileConfig,
  verifyTurnstileToken,
  type TurnstileConfig,
} from "./turnstile";

const complete = {
  TURNSTILE_ENABLED: "true",
  TURNSTILE_SITE_KEY: "site",
  TURNSTILE_SECRET_KEY: "secret",
  TURNSTILE_ALLOWED_HOSTNAMES: "linknest.click, www.linknest.click",
};

describe("resolveTurnstileConfig", () => {
  it("is off unless explicitly switched on", () => {
    expect(resolveTurnstileConfig({})).toEqual({ state: "disabled" });
    expect(resolveTurnstileConfig({ ...complete, TURNSTILE_ENABLED: "1" })).toEqual({ state: "disabled" });
  });

  it("is enabled with every value present", () => {
    expect(resolveTurnstileConfig(complete)).toEqual({
      state: "enabled",
      siteKey: "site",
      secretKey: "secret",
      allowedHostnames: ["linknest.click", "www.linknest.click"],
      testMode: false,
    });
  });

  it("is misconfigured, not disabled, when a value is missing", () => {
    for (const missing of ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "TURNSTILE_ALLOWED_HOSTNAMES"]) {
      expect(resolveTurnstileConfig({ ...complete, [missing]: "" }).state, missing).toBe("misconfigured");
    }
  });

  it("allows test mode (without hostnames) outside production only", () => {
    const test = { ...complete, TURNSTILE_ALLOWED_HOSTNAMES: "", TURNSTILE_TEST_MODE: "true" };
    expect(resolveTurnstileConfig({ ...test, VERCEL_ENV: "preview" })).toMatchObject({
      state: "enabled",
      testMode: true,
    });
    expect(resolveTurnstileConfig({ ...test, VERCEL_ENV: "production" }).state).toBe("misconfigured");
    expect(resolveTurnstileConfig({ ...complete, TURNSTILE_TEST_MODE: "true", VERCEL_ENV: "production" })).toMatchObject({
      state: "enabled",
      testMode: false,
    });
  });
});

describe("clientConfigFor", () => {
  it("hides the widget when disabled and withholds the key when misconfigured", () => {
    expect(clientConfigFor({ state: "disabled" })).toEqual({ enabled: false, siteKey: null });
    expect(clientConfigFor({ state: "misconfigured", reason: "x" })).toEqual({ enabled: true, siteKey: null });
    expect(clientConfigFor(resolveTurnstileConfig(complete))).toEqual({ enabled: true, siteKey: "site" });
  });
});

describe("evaluateSiteverifyResult", () => {
  const opts = { expectedAction: "report", allowedHostnames: ["linknest.click"] };
  const good = { success: true, action: "report", hostname: "linknest.click" };

  it("accepts a successful token for the right action and host", () => {
    expect(evaluateSiteverifyResult(good, opts)).toEqual({ ok: true });
    expect(evaluateSiteverifyResult({ ...good, hostname: "LinkNest.Click" }, opts)).toEqual({ ok: true });
  });

  it("rejects failure, wrong action, wrong host and malformed bodies", () => {
    expect(evaluateSiteverifyResult({ success: false, "error-codes": ["timeout-or-duplicate"] }, opts)).toMatchObject({ ok: false });
    expect(evaluateSiteverifyResult({ ...good, action: "signup" }, opts)).toMatchObject({ ok: false });
    expect(evaluateSiteverifyResult({ ...good, hostname: "evil.example" }, opts)).toMatchObject({ ok: false });
    expect(evaluateSiteverifyResult({ ...good, hostname: undefined }, opts)).toMatchObject({ ok: false });
    expect(evaluateSiteverifyResult("nope", opts)).toMatchObject({ ok: false });
    expect(evaluateSiteverifyResult({ success: "true" }, {})).toMatchObject({ ok: false });
  });

  it("skips the checks it is not given", () => {
    expect(evaluateSiteverifyResult({ success: true }, {})).toEqual({ ok: true });
  });
});

describe("parseAllowedHostnames", () => {
  it("splits, trims, lowercases and drops blanks", () => {
    expect(parseAllowedHostnames(" A.example ,,b.example ")).toEqual(["a.example", "b.example"]);
    expect(parseAllowedHostnames(undefined)).toEqual([]);
  });
});

describe("verifyTurnstileToken", () => {
  const enabled = resolveTurnstileConfig(complete) as TurnstileConfig;
  const respond = (status: number, body: unknown): typeof fetch =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("passes everything when disabled and fails everything when misconfigured", async () => {
    expect(await verifyTurnstileToken({ token: undefined, action: "report" }, { config: { state: "disabled" } })).toEqual({ ok: true });
    expect(
      await verifyTurnstileToken({ token: "t", action: "report" }, { config: { state: "misconfigured", reason: "x" } }),
    ).toMatchObject({ ok: false });
  });

  it("rejects missing and oversized tokens without calling Cloudflare", async () => {
    const never = (async () => {
      throw new Error("should not be called");
    }) as unknown as typeof fetch;
    for (const token of [undefined, "", 42, "x".repeat(2049)]) {
      expect(await verifyTurnstileToken({ token, action: "report" }, { config: enabled, fetchImpl: never })).toMatchObject({ ok: false });
    }
  });

  it("fails closed on network errors, HTTP errors and bad JSON", async () => {
    const boom = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const badJson = (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch;
    for (const fetchImpl of [boom, respond(500, {}), badJson]) {
      expect(await verifyTurnstileToken({ token: "t", action: "report" }, { config: enabled, fetchImpl })).toMatchObject({ ok: false });
    }
  });

  it("checks action and hostname unless in test mode", async () => {
    const other = respond(200, { success: true, action: "test", hostname: "example.com" });
    expect(await verifyTurnstileToken({ token: "t", action: "report" }, { config: enabled, fetchImpl: other })).toMatchObject({ ok: false });
    const testConfig = { ...enabled, testMode: true } as TurnstileConfig;
    expect(await verifyTurnstileToken({ token: "t", action: "report" }, { config: testConfig, fetchImpl: other })).toEqual({ ok: true });
  });

  it("accepts a valid token", async () => {
    const ok = respond(200, { success: true, action: "report", hostname: "linknest.click" });
    expect(await verifyTurnstileToken({ token: "t", action: "report", remoteIp: "198.51.100.7" }, { config: enabled, fetchImpl: ok })).toEqual({ ok: true });
  });
});
