import { describe, it, expect } from "vitest";
import { isAdminRequest, secretsMatch } from "./admin-auth";

describe("secretsMatch", () => {
  it("matches identical secrets", () => {
    expect(secretsMatch("s3cret-value", "s3cret-value")).toBe(true);
  });

  it("rejects different secrets, including different lengths", () => {
    expect(secretsMatch("s3cret-value", "s3cret-valuE")).toBe(false);
    expect(secretsMatch("short", "a-much-longer-secret")).toBe(false);
  });

  it("never matches an empty value", () => {
    expect(secretsMatch("", "")).toBe(false);
    expect(secretsMatch("", "x")).toBe(false);
    expect(secretsMatch("x", "")).toBe(false);
  });
});

describe("isAdminRequest", () => {
  const req = (authorization?: string) =>
    new Request("https://linknest.test/api/admin/moderate", {
      headers: authorization ? { authorization } : {},
    });

  it("accepts the bearer secret", () => {
    expect(isAdminRequest(req("Bearer abc123"), "abc123")).toBe(true);
  });

  it("fails closed when no secret is configured", () => {
    expect(isAdminRequest(req("Bearer abc123"), undefined)).toBe(false);
    expect(isAdminRequest(req("Bearer "), "")).toBe(false);
  });

  it("rejects a missing, malformed or wrong header", () => {
    expect(isAdminRequest(req(), "abc123")).toBe(false);
    expect(isAdminRequest(req("abc123"), "abc123")).toBe(false);
    expect(isAdminRequest(req("Basic abc123"), "abc123")).toBe(false);
    expect(isAdminRequest(req("Bearer abc124"), "abc123")).toBe(false);
  });
});
