import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { coverUrlFor, fetchEmbedMetadata, COVER_MAX_BYTES } from "./embed-metadata";
import type { ParsedEmbed } from "./embeds";

const yt: ParsedEmbed = { provider: "youtube", embedId: "dQw4w9WgXcQ", canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", aspect: "16:9" };
const vimeo: ParsedEmbed = { provider: "vimeo", embedId: "76979871", canonicalUrl: "https://vimeo.com/76979871", aspect: "16:9" };

const png = (w = 64, h = 36) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();

function respond(body: string | Uint8Array, init: ResponseInit = {}) {
  const payload = typeof body === "string" ? body : new Uint8Array(body);
  return new Response(payload as BodyInit, { status: 200, ...init });
}

function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.redirect).toBe("error");
    const url = String(input);
    const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    if (!key) throw new Error(`unexpected fetch ${url}`);
    return routes[key]();
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("coverUrlFor", () => {
  it("builds the YouTube cover from the validated id, ignoring the response", () => {
    expect(coverUrlFor(yt, "https://evil.example/x.jpg")).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  });

  it("accepts only https thumbnails on the provider's image hosts", () => {
    expect(coverUrlFor(vimeo, "https://i.vimeocdn.com/video/1.jpg")).toBe("https://i.vimeocdn.com/video/1.jpg");
    expect(coverUrlFor(vimeo, "http://i.vimeocdn.com/video/1.jpg")).toBeNull();
    expect(coverUrlFor(vimeo, "https://169.254.169.254/latest/meta-data")).toBeNull();
    expect(coverUrlFor(vimeo, "https://i.vimeocdn.com.evil.example/1.jpg")).toBeNull();
    expect(coverUrlFor(vimeo, "https://user@i.vimeocdn.com/1.jpg")).toBeNull();
    expect(coverUrlFor(vimeo, undefined)).toBeNull();
  });
});

describe("fetchEmbedMetadata", () => {
  it("returns the title and a decodable cover", async () => {
    const image = await png();
    const fetchImpl = fakeFetch({
      "https://www.youtube.com/oembed": () => respond(JSON.stringify({ title: "Never Gonna Give You Up" })),
      "https://i.ytimg.com/": () => respond(image, { headers: { "content-type": "image/jpeg" } }),
    });
    const result = await fetchEmbedMetadata(yt, { fetchImpl });
    expect(result.title).toBe("Never Gonna Give You Up");
    expect(result.cover?.length).toBe(image.length);
  });

  it("is never fatal: failures yield nothing", async () => {
    const fetchImpl = fakeFetch({
      "https://www.youtube.com/oembed": () => {
        throw new Error("timeout");
      },
      "https://i.ytimg.com/": () => respond("nope", { status: 404 }),
    });
    expect(await fetchEmbedMetadata(yt, { fetchImpl })).toEqual({});
  });

  it("ignores a thumbnail on a host outside the allowlist", async () => {
    const fetchImpl = fakeFetch({
      "https://vimeo.com/api/oembed.json": () =>
        respond(JSON.stringify({ title: "Clip", thumbnail_url: "https://internal.example/secret.png" })),
    });
    expect(await fetchEmbedMetadata(vimeo, { fetchImpl })).toEqual({ title: "Clip" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses oversize and non-image covers", async () => {
    const big = new Uint8Array(COVER_MAX_BYTES + 1);
    const oversize = fakeFetch({
      "https://www.youtube.com/oembed": () => respond("{}"),
      "https://i.ytimg.com/": () => respond(big, { headers: { "content-type": "image/jpeg" } }),
    });
    expect((await fetchEmbedMetadata(yt, { fetchImpl: oversize })).cover).toBeUndefined();

    const html = fakeFetch({
      "https://www.youtube.com/oembed": () => respond("{}"),
      "https://i.ytimg.com/": async () => respond(await png(), { headers: { "content-type": "text/html" } }),
    });
    expect((await fetchEmbedMetadata(yt, { fetchImpl: html })).cover).toBeUndefined();
  });

  it("refuses images larger than 4096 pixels on a side", async () => {
    const huge = await png(5000, 10);
    const fetchImpl = fakeFetch({
      "https://www.youtube.com/oembed": () => respond("{}"),
      "https://i.ytimg.com/": () => respond(huge, { headers: { "content-type": "image/png" } }),
    });
    expect((await fetchEmbedMetadata(yt, { fetchImpl })).cover).toBeUndefined();
  });
});
