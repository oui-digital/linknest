import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const posthog = vi.hoisted(() => ({
  captureImmediate: vi.fn(),
  capture: vi.fn(),
  flush: vi.fn(),
}));

vi.mock("posthog-node", () => ({
  PostHog: class {
    captureImmediate = posthog.captureImmediate;
    capture = posthog.capture;
    flush = posthog.flush;
  },
}));
vi.mock("@/lib/request-ip", () => ({ getClientIp: async () => "203.0.113.7" }));
vi.mock("@/lib/rate-limit", () => ({
  mutationRateLimit: null,
  checkRateLimit: async () => ({ success: true }),
}));

import { POST } from "./route";
import { SITE_URL } from "@/lib/site";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

function beacon(body: unknown, userAgent = BROWSER_UA) {
  return POST(
    new NextRequest("http://localhost/api/collect", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": userAgent },
      body: JSON.stringify(body),
    }),
  );
}

beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
});

beforeEach(() => {
  posthog.captureImmediate.mockReset().mockResolvedValue(undefined);
  posthog.capture.mockReset();
  posthog.flush.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/collect", () => {
  // Regression: capture() + flush() returned 204 before the request to PostHog
  // had started, so Vercel suspended the function mid-send and events landed
  // minutes late or never.
  it("does not respond until PostHog has accepted the event", async () => {
    let accept!: () => void;
    posthog.captureImmediate.mockImplementation(
      () => new Promise<void>((resolve) => (accept = resolve)),
    );

    let responded = false;
    const response = beacon({ event: "$pageview", slug: "Jordan" }).then((res) => {
      responded = true;
      return res;
    });

    await vi.waitFor(() => expect(posthog.captureImmediate).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(responded).toBe(false);

    accept();
    expect((await response).status).toBe(204);
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("forwards the canonical page URL that /api/analytics filters on", async () => {
    const blockId = "6f1c2b9e-3a4d-4e5f-8a7b-9c0d1e2f3a4b";
    await beacon({
      event: "link_click",
      slug: "Jordan",
      blockId,
      url: "https://example.com/",
      label: "Shop",
    });

    expect(posthog.captureImmediate).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "link_click",
        properties: {
          $current_url: `${SITE_URL}/@jordan`,
          slug: "jordan",
          block_id: blockId,
          url: "https://example.com/",
          label: "Shop",
        },
      }),
    );
  });

  it("still answers 204 when PostHog is unreachable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    posthog.captureImmediate.mockRejectedValue(new Error("ECONNRESET"));

    expect((await beacon({ event: "$pageview", slug: "jordan" })).status).toBe(204);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("drops crawler traffic without contacting PostHog", async () => {
    const res = await beacon({ event: "$pageview", slug: "jordan" }, "Googlebot/2.1");
    expect(res.status).toBe(204);
    expect(posthog.captureImmediate).not.toHaveBeenCalled();
  });
});
