import { describe, it, expect } from "vitest";
import { canonicalizeEmail, getEmailDomain } from "./email-normalize";

describe("canonicalizeEmail", () => {
  it("collapses Gmail dots and plus tags, and googlemail to gmail", () => {
    expect(canonicalizeEmail("Some.One+spam@gmail.com")).toBe("someone@gmail.com");
    expect(canonicalizeEmail("s.o.m.e.o.n.e@googlemail.com")).toBe("someone@gmail.com");
    expect(canonicalizeEmail("someone@googlemail.com")).toBe("someone@gmail.com");
  });

  it("strips plus tags for providers that support them, keeping dots", () => {
    expect(canonicalizeEmail("first.last+news@outlook.com")).toBe("first.last@outlook.com");
    expect(canonicalizeEmail("me+x@proton.me")).toBe("me@proton.me");
  });

  it("only lowercases and trims unknown domains", () => {
    expect(canonicalizeEmail("  Jane+Team@Example.COM ")).toBe("jane+team@example.com");
    expect(canonicalizeEmail("first.last@company.test")).toBe("first.last@company.test");
  });

  it("leaves Yahoo hyphenated addresses alone", () => {
    expect(canonicalizeEmail("real-name@yahoo.com")).toBe("real-name@yahoo.com");
  });

  it("returns malformed input lowercased rather than guessing", () => {
    expect(canonicalizeEmail("no-at-sign")).toBe("no-at-sign");
    expect(canonicalizeEmail("a@b@gmail.com")).toBe("a@b@gmail.com");
    expect(canonicalizeEmail("@gmail.com")).toBe("@gmail.com");
    expect(canonicalizeEmail("+tag@gmail.com")).toBe("+tag@gmail.com");
  });
});

describe("getEmailDomain", () => {
  it("returns the lowercased domain", () => {
    expect(getEmailDomain("x@Mailinator.COM")).toBe("mailinator.com");
    expect(getEmailDomain("nodomain")).toBe("");
  });
});
