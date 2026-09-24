import { describe, it, expect } from "vitest";
import { isDisposableDomain, isDisposableEmailDomain } from "./disposable-email";

const lists = {
  exact: new Set(["mailinator.com", "net.ee"]),
  wildcard: new Set(["10mail.org"]),
};

describe("isDisposableDomain", () => {
  it("matches listed domains, case-insensitively", () => {
    expect(isDisposableDomain("mailinator.com", lists)).toBe(true);
    expect(isDisposableDomain("MAILINATOR.COM.", lists)).toBe(true);
  });

  it("does not treat subdomains of exact entries as disposable", () => {
    expect(isDisposableDomain("company.net.ee", lists)).toBe(false);
  });

  it("matches any subdomain of a wildcard entry", () => {
    expect(isDisposableDomain("10mail.org", lists)).toBe(true);
    expect(isDisposableDomain("abc.10mail.org", lists)).toBe(true);
  });

  it("does not match unrelated domains", () => {
    expect(isDisposableDomain("gmail.com", lists)).toBe(false);
    expect(isDisposableDomain("notmailinator.com", lists)).toBe(false);
    expect(isDisposableDomain("", lists)).toBe(false);
  });
});

describe("the bundled list", () => {
  it("flags a well-known throwaway domain and not mainstream providers", async () => {
    expect(await isDisposableEmailDomain("mailinator.com")).toBe(true);
    for (const d of ["gmail.com", "outlook.com", "icloud.com", "proton.me", "yahoo.com"]) {
      expect(await isDisposableEmailDomain(d), d).toBe(false);
    }
  });
});
