import { describe, it, expect } from "vitest";
import {
  IN_APP_APPS,
  buildEscapeAttempts,
  detectInAppBrowser,
  escapeInstructions,
  escapeTargetUrl,
  inAppLabel,
  intentUrl,
  newHandoffId,
  parseDisabledMethods,
  planInAppEscape,
  readHandoff,
  stripHandoff,
  HANDOFF_ID_RE,
  type InAppPlatform,
} from "./in-app-browser";

import { IN_APP_UAS as UA } from "./in-app-browser.fixtures";

const PLAIN = {
  desktopChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  facebookCrawler: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  facebot: "Facebot",
  windowsFacebook:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) [FBAN/FBWindows;FBAV/300.0]",
};

describe("detectInAppBrowser", () => {
  it("identifies each Meta app on each platform", () => {
    expect(detectInAppBrowser(UA.instagramIos)).toEqual({ app: "instagram", platform: "ios" });
    expect(detectInAppBrowser(UA.facebookIos)).toEqual({ app: "facebook", platform: "ios" });
    expect(detectInAppBrowser(UA.instagramAndroid)).toEqual({ app: "instagram", platform: "android" });
    expect(detectInAppBrowser(UA.facebookAndroid)).toEqual({ app: "facebook", platform: "android" });
    expect(detectInAppBrowser(UA.messengerIos)).toEqual({ app: "messenger", platform: "ios" });
    expect(detectInAppBrowser(UA.messengerAndroid)).toEqual({ app: "messenger", platform: "android" });
    expect(detectInAppBrowser(UA.threadsIos)).toEqual({ app: "threads", platform: "ios" });
    expect(detectInAppBrowser(UA.threadsAndroid)).toEqual({ app: "threads", platform: "android" });
  });

  it("ignores ordinary browsers, crawlers and unknown platforms", () => {
    for (const [name, ua] of Object.entries(PLAIN)) {
      expect(detectInAppBrowser(ua), name).toBeNull();
    }
    expect(detectInAppBrowser("")).toBeNull();
    expect(detectInAppBrowser(null)).toBeNull();
    expect(detectInAppBrowser(undefined)).toBeNull();
  });

  it("prefers Messenger over Facebook and Threads over Instagram", () => {
    // Messenger UAs carry FBAV/ too.
    expect(detectInAppBrowser(UA.messengerIos)?.app).toBe("messenger");
    expect(detectInAppBrowser(`${UA.threadsIos} Instagram`)?.app).toBe("threads");
  });
});

const ORIGIN = "https://linknest.click";
const ID = "0123456789abcdef";

describe("escapeTargetUrl", () => {
  it("is the canonical page with no query by default", () => {
    expect(escapeTargetUrl(ORIGIN, "jordan", undefined)).toBe("https://linknest.click/@jordan");
  });

  it("keeps every incoming parameter, repeated keys in order, and adds the marker", () => {
    const url = escapeTargetUrl(
      ORIGIN,
      "jordan",
      { utm_source: "ig", tag: ["a", "b"], fbclid: "x", empty: undefined },
      "instagram",
      ID,
    );
    const q = new URL(url).searchParams;
    expect(q.get("utm_source")).toBe("ig");
    expect(q.getAll("tag")).toEqual(["a", "b"]);
    expect(q.get("fbclid")).toBe("x");
    expect(q.has("empty")).toBe(false);
    expect(q.get("ln_h")).toBe(`instagram-${ID}`);
  });

  it("re-encodes awkward values and does not cap long queries", () => {
    const long = "v".repeat(2048);
    const url = escapeTargetUrl(ORIGIN, "jordan", {
      q: "a&b=c+d e",
      u: "café ✓",
      long,
    });
    const q = new URL(url).searchParams;
    expect(q.get("q")).toBe("a&b=c+d e");
    expect(q.get("u")).toBe("café ✓");
    expect(q.get("long")).toBe(long);
  });

  it("replaces an incoming marker instead of duplicating it", () => {
    const url = escapeTargetUrl(ORIGIN, "jordan", { ln_h: "facebook-ffffffffffffffff" }, "instagram", ID);
    expect(new URL(url).searchParams.getAll("ln_h")).toEqual([`instagram-${ID}`]);
  });

  it("drops an incoming marker when no new id is issued", () => {
    const url = escapeTargetUrl(ORIGIN, "jordan", { ln_h: "facebook-ffffffffffffffff", a: "1" });
    expect(url).toBe("https://linknest.click/@jordan?a=1");
  });
});

describe("escape attempts", () => {
  const target = "https://linknest.click/@jordan?utm_source=ig#top";

  it("builds an intent URL that keeps the query and drops the fragment", () => {
    expect(intentUrl(target)).toBe(
      "intent://linknest.click/@jordan?utm_source=ig#Intent;scheme=https;end",
    );
    expect(intentUrl("http://localhost:3000/@a")).toBe(
      "intent://localhost:3000/@a#Intent;scheme=http;end",
    );
  });

  it("uses the intent link on every Android app", () => {
    for (const app of IN_APP_APPS) {
      expect(buildEscapeAttempts(target, { app, platform: "android" })).toEqual([
        { method: "intent", url: intentUrl(target), via: "href" },
      ]);
    }
  });

  it("uses Instagram's own external-browser scheme on iOS Instagram", () => {
    const plain = "https://linknest.click/@jordan?utm_source=ig";
    expect(buildEscapeAttempts(plain, { app: "instagram", platform: "ios" })).toEqual([
      {
        method: "ig_extbrowser",
        url: "instagram://extbrowser/?url=https%3A%2F%2Flinknest.click%2F%40jordan%3Futm_source%3Dig",
        via: "href",
      },
    ]);
  });

  it("uses x-safari-https through window.open on the other iOS apps", () => {
    for (const app of ["facebook", "messenger", "threads"] as const) {
      expect(buildEscapeAttempts(target, { app, platform: "ios" })).toEqual([
        { method: "x_safari", url: "x-safari-https://linknest.click/@jordan?utm_source=ig", via: "open" },
      ]);
    }
  });

  it("leaves no attempt when the method is disabled", () => {
    expect(
      buildEscapeAttempts(target, { app: "instagram", platform: "ios" }, new Set(["ig_extbrowser"])),
    ).toEqual([]);
  });
});

describe("parseDisabledMethods / planInAppEscape", () => {
  it("parses the kill switch", () => {
    expect(parseDisabledMethods(undefined)).toEqual(new Set());
    expect(parseDisabledMethods(" intent , X_SAFARI,bogus")).toEqual(new Set(["intent", "x_safari"]));
    expect(parseDisabledMethods("intent,all")).toBe("all");
  });

  it("plans an escape, or none when everything is disabled", () => {
    const info = { app: "instagram", platform: "ios" } as const;
    const plan = planInAppEscape(info, "https://linknest.click/@a");
    expect(plan).toMatchObject({ app: "instagram", platform: "ios", autoAttempt: false });
    expect(plan?.attempts).toHaveLength(1);
    expect(planInAppEscape(info, "https://linknest.click/@a", { disabled: "all" })).toBeNull();
    expect(
      planInAppEscape(info, "https://linknest.click/@a", { disabled: new Set(["ig_extbrowser"]) })?.attempts,
    ).toEqual([]);
  });

  it("only ever auto-attempts an Android intent", () => {
    const url = "https://linknest.click/@a";
    expect(planInAppEscape({ app: "instagram", platform: "android" }, url, { autoAttempt: true })?.autoAttempt).toBe(true);
    expect(planInAppEscape({ app: "instagram", platform: "ios" }, url, { autoAttempt: true })?.autoAttempt).toBe(false);
    expect(
      planInAppEscape({ app: "instagram", platform: "android" }, url, {
        autoAttempt: true,
        disabled: new Set(["intent"]),
      })?.autoAttempt,
    ).toBe(false);
  });
});

describe("handoff marker", () => {
  it("issues 16-hex ids", () => {
    const a = newHandoffId();
    expect(a).toMatch(HANDOFF_ID_RE);
    expect(newHandoffId()).not.toBe(a);
  });

  it("reads only well-formed markers", () => {
    expect(readHandoff(`?ln_h=instagram-${ID}`)).toEqual({ app: "instagram", id: ID });
    expect(readHandoff(`?a=1&ln_h=threads-${ID}`)).toEqual({ app: "threads", id: ID });
    expect(readHandoff(`?ln_h=tiktok-${ID}`)).toBeNull();
    expect(readHandoff("?ln_h=instagram-xyz")).toBeNull();
    expect(readHandoff(`?ln_h=instagram-${ID}0`)).toBeNull();
    expect(readHandoff("")).toBeNull();
  });

  it("strips the marker and keeps everything else", () => {
    expect(stripHandoff(`https://linknest.click/@a?utm_source=ig&ln_h=instagram-${ID}#x`)).toBe(
      "https://linknest.click/@a?utm_source=ig#x",
    );
    const clean = "https://linknest.click/@a?b=1";
    expect(stripHandoff(clean)).toBe(clean);
  });
});

describe("labels and instructions", () => {
  it("covers every app on every platform", () => {
    for (const app of IN_APP_APPS) {
      expect(inAppLabel(app)).toMatch(/^[A-Z]/);
      for (const platform of ["ios", "android"] as InAppPlatform[]) {
        expect(escapeInstructions({ app, platform }).length).toBeGreaterThan(10);
      }
    }
  });
});
