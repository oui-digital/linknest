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
const handoff = vi.hoisted(() => ({
  consumeHandoff: vi.fn(),
  registerHandoff: vi.fn(),
}));
vi.mock("@/lib/handoff", () => ({
  handoffStore: {},
  consumeHandoff: handoff.consumeHandoff,
  registerHandoff: handoff.registerHandoff,
}));
// The real acknowledgement is tested against the real SDK in
// posthog-delivery.test.ts; here it is a switch.
const delivery = vi.hoisted(() => ({ ack: true }));
vi.mock("@/lib/posthog-delivery", () => ({
  trackedFetch: vi.fn(),
  sendWithAck: async (
    client: { captureImmediate: (m: unknown) => Promise<void> },
    message: unknown,
  ) => {
    await client.captureImmediate(message);
    return delivery.ack;
  },
}));
vi.mock("@/lib/request-ip", () => ({ getClientIp: async () => "203.0.113.7" }));
vi.mock("@/lib/rate-limit", () => ({
  mutationRateLimit: null,
  checkRateLimit: async () => ({ success: true }),
}));

import { POST } from "./route";
import { SITE_URL } from "@/lib/site";
import { IN_APP_UAS } from "@/lib/in-app-browser.fixtures";

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
  handoff.consumeHandoff.mockReset().mockResolvedValue(false);
  handoff.registerHandoff.mockReset().mockResolvedValue(undefined);
  delivery.ack = true;
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

  it("accepts embed activations and the banner's pseudo block id", async () => {
    const blockId = "6f1c2b9e-3a4d-4e5f-8a7b-9c0d1e2f3a4b";
    await beacon({
      event: "embed_play",
      slug: "jordan",
      blockId,
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      label: "Play",
    });
    expect(posthog.captureImmediate).toHaveBeenLastCalledWith(
      expect.objectContaining({ event: "embed_play" }),
    );

    await beacon({
      event: "link_click",
      slug: "jordan",
      blockId: "banner",
      url: "https://shop.example/",
      label: "Banner",
    });
    expect(posthog.captureImmediate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        event: "link_click",
        properties: expect.objectContaining({ block_id: "banner" }),
      }),
    );
  });

  it("drops events whose block id is neither a uuid nor the banner", async () => {
    const res = await beacon({ event: "link_click", slug: "jordan", blockId: "evil" });
    expect(res.status).toBe(204);
    expect(posthog.captureImmediate).not.toHaveBeenCalled();
  });

  it("drops crawler traffic without contacting PostHog", async () => {
    const res = await beacon({ event: "$pageview", slug: "jordan" }, "Googlebot/2.1");
    expect(res.status).toBe(204);
    expect(posthog.captureImmediate).not.toHaveBeenCalled();
  });
});

describe("referring domain", () => {
  it("forwards the cleaned referrer domain on page views", async () => {
    await beacon({ event: "$pageview", slug: "jordan", referrer: "l.instagram.com" });
    expect(posthog.captureImmediate).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({ $referring_domain: "instagram.com" }),
      }),
    );
  });

  it("still counts the view when the referrer is malformed", async () => {
    const res = await beacon({ event: "$pageview", slug: "jordan", referrer: "not a host/path" });
    expect(res.status).toBe(204);
    const props = posthog.captureImmediate.mock.calls[0][0].properties;
    expect(props).not.toHaveProperty("$referring_domain");
  });

  it("never attaches a referrer to link clicks", async () => {
    await beacon({ event: "link_click", slug: "jordan", referrer: "example.com" });
    const props = posthog.captureImmediate.mock.calls[0][0].properties;
    expect(props).not.toHaveProperty("$referring_domain");
  });
});

describe("in-app browsers", () => {
  const ID = "0123456789abcdef";
  const lastCall = () => posthog.captureImmediate.mock.calls.at(-1)![0];

  it("does not mistake Meta in-app browsers for bots", async () => {
    for (const [name, ua] of Object.entries(IN_APP_UAS)) {
      posthog.captureImmediate.mockClear();
      await beacon({ event: "$pageview", slug: "jordan" }, ua);
      expect(posthog.captureImmediate, name).toHaveBeenCalledTimes(1);
    }
  });

  it("attributes an in-app view with no referrer to the app and registers its credit after delivery", async () => {
    await beacon({ event: "$pageview", slug: "Jordan", inApp: "instagram", handoffId: ID });
    expect(lastCall()).toMatchObject({
      event: "$pageview",
      properties: { in_app: "instagram", handoff_id: ID, $referring_domain: "instagram.com" },
    });
    expect(handoff.registerHandoff).toHaveBeenCalledWith({}, "jordan", ID);
    expect(posthog.captureImmediate.mock.invocationCallOrder[0]).toBeLessThan(
      handoff.registerHandoff.mock.invocationCallOrder[0]!,
    );
    expect(handoff.consumeHandoff).not.toHaveBeenCalled();
  });

  it("creates no credit when PostHog did not acknowledge the source view", async () => {
    delivery.ack = false;
    await beacon({ event: "$pageview", slug: "jordan", inApp: "instagram", handoffId: ID });
    expect(posthog.captureImmediate).toHaveBeenCalledTimes(1);
    expect(handoff.registerHandoff).not.toHaveBeenCalled();
  });

  it("keeps a real referrer over the app fallback", async () => {
    await beacon({ event: "$pageview", slug: "jordan", inApp: "facebook", referrer: "l.facebook.com" });
    expect(lastCall().properties.$referring_domain).toBe("facebook.com");
    await beacon({ event: "$pageview", slug: "jordan", inApp: "threads", referrer: "news.example" });
    expect(lastCall().properties.$referring_domain).toBe("news.example");
  });

  it("records an arrival that spends a credit as page_handoff, deciding before capture", async () => {
    handoff.consumeHandoff.mockResolvedValue(true);
    await beacon({ event: "$pageview", slug: "jordan", handoff: "instagram", handoffId: ID });
    expect(handoff.consumeHandoff).toHaveBeenCalledWith({}, "jordan", ID);
    expect(handoff.consumeHandoff.mock.invocationCallOrder[0]).toBeLessThan(
      posthog.captureImmediate.mock.invocationCallOrder[0]!,
    );
    expect(lastCall()).toMatchObject({
      event: "page_handoff",
      properties: { in_app_handoff: "instagram", handoff_id: ID },
    });
    expect(handoff.registerHandoff).not.toHaveBeenCalled();
  });

  it("counts an arrival without a credit as a view attributed to the app", async () => {
    await beacon({ event: "$pageview", slug: "jordan", handoff: "instagram", handoffId: ID });
    expect(lastCall()).toMatchObject({
      event: "$pageview",
      properties: { in_app_handoff: "instagram", handoff_id: ID, $referring_domain: "instagram.com" },
    });
  });

  it("treats a malformed handoff id as a plain counted view", async () => {
    await beacon({ event: "$pageview", slug: "jordan", handoff: "instagram", handoffId: "nope" });
    await beacon({ event: "$pageview", slug: "jordan", inApp: "instagram", handoffId: "nope" });
    expect(handoff.consumeHandoff).not.toHaveBeenCalled();
    expect(handoff.registerHandoff).not.toHaveBeenCalled();
    for (const [call] of posthog.captureImmediate.mock.calls) {
      expect(call.event).toBe("$pageview");
      expect(call.properties).not.toHaveProperty("handoff_id");
    }
  });

  it("ignores a handoff marker on a view the server saw in-app", async () => {
    await beacon({ event: "$pageview", slug: "jordan", inApp: "instagram", handoff: "facebook", handoffId: ID });
    expect(handoff.consumeHandoff).not.toHaveBeenCalled();
    expect(lastCall().properties).not.toHaveProperty("in_app_handoff");
  });

  it("forwards escape events and rejects unknown values", async () => {
    await beacon({
      event: "inapp_escape",
      slug: "jordan",
      inApp: "instagram",
      platform: "ios",
      method: "ig_extbrowser",
      outcome: "attempt",
    });
    expect(lastCall()).toMatchObject({
      event: "inapp_escape",
      properties: {
        in_app: "instagram",
        in_app_platform: "ios",
        escape_method: "ig_extbrowser",
        escape_outcome: "attempt",
      },
    });
    expect(lastCall().properties).not.toHaveProperty("$referring_domain");

    posthog.captureImmediate.mockClear();
    await beacon({ event: "inapp_escape", slug: "jordan", inApp: "tiktok", method: "intent" });
    await beacon({ event: "inapp_escape", slug: "jordan", inApp: "instagram", method: "ftp" });
    await beacon({ event: "page_handoff", slug: "jordan" });
    expect(posthog.captureImmediate).not.toHaveBeenCalled();
  });

  it("never attaches in-app properties to link clicks", async () => {
    await beacon({ event: "link_click", slug: "jordan", inApp: "instagram", handoffId: ID, handoff: "instagram" });
    const props = lastCall().properties;
    expect(props).not.toHaveProperty("in_app");
    expect(props).not.toHaveProperty("in_app_handoff");
    expect(props).not.toHaveProperty("handoff_id");
  });
});
