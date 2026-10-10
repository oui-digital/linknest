import { describe, it, expect, vi, afterEach } from "vitest";
import { PostHog, type PostHogOptions } from "posthog-node";
import { createTrackedFetch, sendWithAck } from "./posthog-delivery";

/**
 * Against the REAL posthog-node client: only the network is replaced. Mocking
 * captureImmediate would hide exactly the behaviour this module exists for —
 * the SDK resolving captureImmediate() even when delivery failed.
 */

type Fetch = NonNullable<PostHogOptions["fetch"]>;
const ok = (status = 200) => ({ status, text: async () => "{}", json: async () => ({}) });
const clients: PostHog[] = [];

function client(transport: Fetch, extra: Partial<PostHogOptions> = {}) {
  const c = new PostHog("phc_test", {
    host: "https://ph.example",
    fetch: createTrackedFetch(transport),
    fetchRetryCount: 1,
    fetchRetryDelay: 1,
    requestTimeout: 100,
    disableGeoip: true,
    ...extra,
  });
  c.on("error", () => {}); // the SDK's own failure channel; keep test output quiet
  clients.push(c);
  return c;
}

const message = (event = "$pageview") => ({ distinctId: "d", event, properties: { slug: "jordan" } });

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(clients.splice(0).map((c) => c.shutdown(100)));
});

describe("sendWithAck", () => {
  it("documents the SDK behaviour: captureImmediate resolves although delivery failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const c = client(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(c.captureImmediate(message())).resolves.toBeUndefined();
  });

  it("is false when the transport throws, and does not throw itself", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const transport = vi.fn<Fetch>(async () => {
      throw new Error("ECONNRESET");
    });
    expect(await sendWithAck(client(transport), message())).toBe(false);
    expect(transport).toHaveBeenCalledTimes(2); // first try + one retry
  });

  it("is false when every attempt returns a server error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendWithAck(client(async () => ok(500)), message())).toBe(false);
  });

  it("is true when the retry succeeds after a server error", async () => {
    const transport = vi.fn<Fetch>().mockResolvedValueOnce(ok(500)).mockResolvedValueOnce(ok(200));
    expect(await sendWithAck(client(transport), message())).toBe(true);
    expect(transport.mock.calls[0]![0]).toBe("https://ph.example/batch/");
  });

  it("is true on a plain success", async () => {
    expect(await sendWithAck(client(async () => ok(200)), message())).toBe(true);
  });

  it("is false when the request times out", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hang: Fetch = (_url, init) =>
      new Promise((_, reject) =>
        init.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
      );
    expect(await sendWithAck(client(hang, { requestTimeout: 20 }), message())).toBe(false);
  });

  it("ignores successful responses from other endpoints", async () => {
    const tracked = createTrackedFetch(async () => ok(200));
    // Outside sendWithAck there is no request scope at all.
    await expect(tracked("https://ph.example/flags/?v=2", { method: "POST", headers: {} })).resolves.toMatchObject({
      status: 200,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Inside a scope, a 200 from a non-batch URL must not count as delivery.
    const c = client(async (url) => (url.endsWith("/batch/") ? ok(500) : ok(200)));
    expect(await sendWithAck(c, message())).toBe(false);
  });

  it("keeps concurrent requests' acknowledgements apart on one client", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Route by distinct id inside the (gzip-compressed) payload; the failing
    // request settles first so the two scopes interleave.
    const routed = client(async (_url, init) => {
      const raw = init.body;
      const text =
        typeof raw === "string"
          ? raw
          : await new Response((raw as Blob).stream().pipeThrough(new DecompressionStream("gzip"))).text();
      await new Promise((r) => setTimeout(r, text.includes('"fail"') ? 5 : 15));
      return text.includes('"fail"') ? ok(500) : ok(200);
    });
    const [failed, delivered] = await Promise.all([
      sendWithAck(routed, { distinctId: "fail", event: "$pageview" }),
      sendWithAck(routed, { distinctId: "pass", event: "$pageview" }),
    ]);
    expect([failed, delivered]).toEqual([false, true]);
  });
});
