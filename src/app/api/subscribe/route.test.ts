import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requestSubscription: vi.fn(),
  deliverConfirmation: vi.fn(),
  verifyTurnstileToken: vi.fn(),
  isDisposableEmailDomain: vi.fn(),
  checkRateLimit: vi.fn(),
  recentCount: { n: 0 },
  after: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/db", () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: async () => [mocks.recentCount],
  };
  return { db: chain };
});
vi.mock("@/lib/request-ip", () => ({ getClientIp: async () => "203.0.113.7" }));
vi.mock("@/lib/rate-limit", () => ({
  subscribeRateLimit: "network",
  emailRateLimit: "mailbox",
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/lib/turnstile", () => ({
  TURNSTILE_FAILED_ERROR: "Verification failed. Please try again.",
  verifyTurnstileToken: mocks.verifyTurnstileToken,
}));
vi.mock("@/lib/disposable-email", () => ({ isDisposableEmailDomain: mocks.isDisposableEmailDomain }));
vi.mock("@/lib/subscribers", () => ({
  requestSubscription: mocks.requestSubscription,
  deliverConfirmation: mocks.deliverConfirmation,
}));
vi.mock("@/lib/subscribe-mail", () => ({ sendConfirmation: vi.fn() }));

import { POST } from "./route";

const PAGE = "6f1c2b9e-3a4d-4e5f-8a7b-9c0d1e2f3a4b";
const BLOCK = "7a2d3c0f-4b5e-4f60-9b8c-0d1e2f3a4b5c";

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest("http://localhost/api/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const valid = { pageId: PAGE, blockId: BLOCK, email: "fan@example.com", turnstileToken: "t" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recentCount.n = 0;
  mocks.verifyTurnstileToken.mockResolvedValue({ ok: true });
  mocks.isDisposableEmailDomain.mockResolvedValue(false);
  mocks.checkRateLimit.mockResolvedValue({ success: true });
  mocks.requestSubscription.mockResolvedValue({ outcome: "sent", claim: { subscriberId: "s" } });
});

describe("POST /api/subscribe", () => {
  it("refuses non-JSON and cross-site requests", async () => {
    const form = await POST(
      new NextRequest("http://localhost/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "email=a@b.c",
      }),
    );
    expect(form.status).toBe(415);
    expect((await post(valid, { origin: "https://evil.example" })).status).toBe(403);
  });

  it("validates ids and the address before doing any work", async () => {
    expect((await post({ ...valid, pageId: "nope" })).status).toBe(404);
    expect((await post({ ...valid, email: "not-an-email" })).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
    expect(mocks.requestSubscription).not.toHaveBeenCalled();
  });

  it("answers a filled honeypot like a success, without verifying or storing", async () => {
    const res = await post({ ...valid, website: "spam.example" });
    expect(res.status).toBe(200);
    expect(mocks.verifyTurnstileToken).not.toHaveBeenCalled();
    expect(mocks.requestSubscription).not.toHaveBeenCalled();
  });

  it("requires a Turnstile pass for the subscribe action", async () => {
    mocks.verifyTurnstileToken.mockResolvedValue({ ok: false, reason: "bad" });
    expect((await post(valid)).status).toBe(403);
    expect(mocks.verifyTurnstileToken).toHaveBeenCalledWith(expect.objectContaining({ action: "subscribe" }));
  });

  it("refuses disposable domains and rate-limited networks", async () => {
    mocks.isDisposableEmailDomain.mockResolvedValueOnce(true);
    expect((await post(valid)).status).toBe(400);
    mocks.checkRateLimit.mockResolvedValueOnce({ success: false });
    expect((await post(valid)).status).toBe(429);
  });

  it("falls back to a database cap when the limiter is unavailable", async () => {
    mocks.recentCount.n = 50;
    expect((await post(valid)).status).toBe(429);
  });

  it("gives the same answer for new, pending and confirmed addresses", async () => {
    const bodies = [];
    for (const outcome of ["sent", "deferred", "already_confirmed"]) {
      mocks.requestSubscription.mockResolvedValueOnce(
        outcome === "sent" ? { outcome, claim: { subscriberId: "s" } } : { outcome },
      );
      const res = await post(valid);
      bodies.push([res.status, await res.json()]);
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  it("sends the confirmation after responding, only when a claim was taken", async () => {
    await post(valid);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    mocks.requestSubscription.mockResolvedValueOnce({ outcome: "deferred" });
    await post(valid);
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });

  it("answers a throttled mailbox like a success without storing anything", async () => {
    mocks.checkRateLimit.mockImplementation(async (limiter: string) => ({ success: limiter !== "mailbox" }));
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect(mocks.requestSubscription).not.toHaveBeenCalled();
  });

  it("reports a closed list and a missing form", async () => {
    mocks.requestSubscription.mockResolvedValueOnce({ outcome: "list_full" });
    expect((await post(valid)).status).toBe(409);
    mocks.requestSubscription.mockResolvedValueOnce({ outcome: "not_found" });
    expect((await post(valid)).status).toBe(404);
  });
});
