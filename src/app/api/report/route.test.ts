import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// Body validation runs before any lookup; these guard against it being skipped.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/turnstile", () => ({
  TURNSTILE_FAILED_ERROR: "captcha",
  verifyTurnstileToken: vi.fn(async () => {
    throw new Error("reached Turnstile");
  }),
}));

import { POST } from "./route";

function report(body: string) {
  return POST(
    new NextRequest("http://localhost/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  );
}

describe("POST /api/report body validation", () => {
  it.each(["null", "[]", '"page"', "42", "{}", '{"pageId":1,"reason":"spam"}'])(
    "rejects %s with 400",
    async (body) => {
      expect((await report(body)).status).toBe(400);
    },
  );

  it("rejects malformed JSON with 400", async () => {
    expect((await report("{")).status).toBe(400);
  });

  it("treats a page id Postgres cannot parse as not found", async () => {
    const res = await report(JSON.stringify({ pageId: "-".repeat(36), reason: "spam" }));
    expect(res.status).toBe(404);
  });
});
