import { describe, it, expect } from "vitest";
import {
  hashToken,
  newToken,
  toCsv,
  unsubscribeTokenFor,
  verifyUnsubscribeToken,
  type SubscriberRow,
} from "./subscribers";

const SECRET = "test-secret";
const ID = "6f1c2b9e-3a4d-4e5f-8a7b-9c0d1e2f3a4b";

describe("tokens", () => {
  it("stores only a sha256 hash of the confirm token", () => {
    const raw = newToken();
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(raw)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(raw)).not.toBe(raw);
  });

  it("verifies unsubscribe tokens for the right subscriber only", () => {
    const token = unsubscribeTokenFor(ID, SECRET);
    expect(verifyUnsubscribeToken(ID, token, SECRET)).toBe(true);
    expect(verifyUnsubscribeToken("00000000-0000-4000-8000-000000000000", token, SECRET)).toBe(false);
    expect(verifyUnsubscribeToken(ID, token, "other-secret")).toBe(false);
    expect(verifyUnsubscribeToken(ID, "nope", SECRET)).toBe(false);
    expect(verifyUnsubscribeToken(ID, undefined, SECRET)).toBe(false);
  });
});

describe("toCsv", () => {
  const row = (email: string): SubscriberRow => ({
    id: ID,
    email,
    status: "confirmed",
    pageId: ID,
    pageSlug: "jordan",
    requestedAt: new Date("2026-10-01T10:00:00Z"),
    confirmedAt: new Date("2026-10-01T10:05:00Z"),
    unsubscribedAt: null,
  });

  it("writes a header and RFC 4180 rows", () => {
    expect(toCsv([row("a@example.com")])).toBe(
      "email,status,page,requested_at,confirmed_at,unsubscribed_at\r\n" +
        "a@example.com,confirmed,jordan,2026-10-01T10:00:00.000Z,2026-10-01T10:05:00.000Z,\r\n",
    );
  });

  it("quotes separators and neutralises spreadsheet formulas", () => {
    const csv = toCsv([row('=HYPERLINK("x")'), row("a,b@example.com"), row("+1@example.com")]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`"a,b@example.com"`);
    expect(csv).toContain(`'+1@example.com`);
  });
});
