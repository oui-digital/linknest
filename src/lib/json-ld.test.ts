import { describe, expect, it } from "vitest";
import { profilePageJsonLd, serializeJsonLd } from "./json-ld";

const NOW = new Date("2026-10-11T18:51:24.478Z");
const page = {
  title: "Oui Digital",
  bio: "San Diego web design studio.",
  avatarUrl: "https://assets.linknest.click/ws/avatar.webp",
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: NOW,
};
const socials = {
  type: "socials",
  isVisible: true,
  content: {
    items: [
      { platform: "instagram", url: "https://instagram.com/ouidigital" },
      { platform: "email", url: "mailto:hi@oui.digital" },
      { platform: "phone", url: "tel:+16192590530" },
    ],
  },
};
const link = { type: "link", isVisible: true, content: {} };
const canonicalUrl = "https://www.linknest.click/@ouidigital";

describe("profilePageJsonLd", () => {
  it("describes a Person by default, with the page's own fields", () => {
    const ld = profilePageJsonLd({ page, blocks: [link], canonicalUrl });
    expect(ld["@type"]).toBe("ProfilePage");
    expect(ld.mainEntity).toMatchObject({
      "@type": "Person",
      name: "Oui Digital",
      description: page.bio,
      image: page.avatarUrl,
      url: canonicalUrl,
    });
    expect(ld.dateModified).toBe(NOW.toISOString());
    expect(ld.dateCreated).toBe("2026-09-01T00:00:00.000Z");
  });

  it("describes an Organization when asked", () => {
    const ld = profilePageJsonLd({ page, blocks: [], canonicalUrl, entityKind: "organization" });
    expect(ld.mainEntity["@type"]).toBe("Organization");
  });

  it("lists only web identity links from visible social-icon blocks as sameAs", () => {
    const ld = profilePageJsonLd({
      page,
      blocks: [socials, { ...socials, isVisible: false, content: { items: [{ platform: "youtube", url: "https://youtube.com/@x" }] } }, link],
      canonicalUrl,
    });
    expect(ld.mainEntity.sameAs).toEqual(["https://instagram.com/ouidigital"]);
  });

  it("omits empty fields rather than emitting nulls", () => {
    const ld = profilePageJsonLd({ page: { ...page, bio: null, avatarUrl: null }, blocks: [], canonicalUrl });
    expect("description" in ld.mainEntity).toBe(false);
    expect("image" in ld.mainEntity).toBe(false);
    expect("sameAs" in ld.mainEntity).toBe(false);
  });

  // A warm data cache hands dates back as ISO strings.
  it("accepts ISO strings for the dates", () => {
    const ld = profilePageJsonLd({
      page: { ...page, createdAt: page.createdAt.toISOString(), updatedAt: NOW.toISOString() },
      blocks: [],
      canonicalUrl,
    });
    expect(ld.dateModified).toBe(NOW.toISOString());
  });
});

describe("serializeJsonLd", () => {
  it("cannot be broken out of by page content", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script>");
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
