import type { InferSelectModel } from "drizzle-orm";
import type { blocks, pages } from "@/lib/db/schema";
import { getTemplate } from "@/lib/templates";
import type { ThemeTokens } from "@/lib/templates/theme";

type Page = InferSelectModel<typeof pages>;
type Block = InferSelectModel<typeof blocks>;

const ART = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="16" fill="#e8e0f0"/><circle cx="58" cy="23" r="17" fill="#e8614d"/><path d="M0 68 37 24l43 56H0" fill="#1a1a2e"/></svg>')}`;
const BOOKING_ART = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 700"><rect width="400" height="700" fill="#e9eef3"/><rect x="44" y="120" width="312" height="460" rx="22" fill="white"/><rect x="44" y="120" width="312" height="78" rx="22" fill="#1a1a2e"/><circle cx="100" cy="160" r="12" fill="#e8614d"/><circle cx="140" cy="160" r="12" fill="#e8614d"/><rect x="78" y="240" width="244" height="18" rx="9" fill="#dce3ed"/><rect x="78" y="294" width="68" height="68" rx="12" fill="#f7ddd7"/><rect x="166" y="294" width="68" height="68" rx="12" fill="#e4e1fb"/><rect x="254" y="294" width="68" height="68" rx="12" fill="#dce3ed"/><rect x="78" y="382" width="68" height="68" rx="12" fill="#dce3ed"/><rect x="166" y="382" width="68" height="68" rx="12" fill="#f7ddd7"/><rect x="254" y="382" width="68" height="68" rx="12" fill="#e4e1fb"/></svg>')}`;
const NOW = new Date("2026-10-01T12:00:00Z");

function block(pageId: string, position: number, type: string, label: string | null, url: string | null, content: Record<string, unknown> = {}): Block {
  return { id: `${pageId.slice(0, 24)}${String(position + 1).padStart(12, "0")}`, pageId, position, type, label, url, content, isVisible: true, createdAt: NOW, updatedAt: NOW };
}

export function marketingExample(kind: "creator" | "service" | "multi", templateId?: string, focus?: "email_capture" | "embed"): { page: Page; blocks: Block[]; theme: ThemeTokens } {
  const chosen = templateId ?? (kind === "service" ? "bento-box" : kind === "multi" ? "ink" : "clean-slate");
  const template = getTemplate(chosen);
  const id = kind === "creator" ? "11111111-1111-4111-8111-111111111111" : kind === "service" ? "22222222-2222-4222-8222-222222222222" : "33333333-3333-4333-8333-333333333333";
  const details = {
    creator: { slug: "maya-creates", title: "Maya Chen", bio: "Art, process and new releases in one place.", banner: { text: "New collection is here", url: "https://example.com/collection" } },
    service: { slug: "north-studio", title: "North Studio", bio: "Thoughtful design for small businesses.", banner: null },
    multi: { slug: "studio-projects", title: "Studio Projects", bio: "A home for our work, writing and experiments.", banner: null },
  }[kind];
  const page: Page = {
    id, workspaceId: id, slug: details.slug, title: details.title, bio: details.bio,
    avatarUrl: null, avatarAlt: null, templateId: chosen, theme: {}, seoTitle: null, seoDescription: null,
    language: "en", entityKind: "person", ogImageUrl: null, faviconUrl: null, banner: details.banner,
    isPublished: true, publishedAt: NOW, firstPublishedAt: NOW, contentVersion: 1, createdAt: NOW, updatedAt: NOW,
  };
  const blocks: Block[] = kind === "creator" ? [
    block(id, 0, "link", "Explore the new collection", "https://example.com/collection", { description: "Prints, originals and stories", thumbnailUrl: ART, featured: true }),
    block(id, 1, "embed", "Watch the studio tour", "https://www.youtube.com/watch?v=jfKfPfyJRdk", { provider: "youtube", embedId: "jfKfPfyJRdk", aspect: "16:9" }),
    block(id, 2, "email_capture", null, null, { heading: "New art, straight to your inbox", description: "Get first looks and launch notes.", buttonLabel: "Join the list" }),
    block(id, 3, "socials", null, null, { items: [{ platform: "instagram", url: "https://instagram.com/", label: "Instagram" }, { platform: "youtube", url: "https://youtube.com/", label: "YouTube" }] }),
  ] : kind === "service" ? [
    block(id, 0, "link", "See recent work", "https://example.com/work", { thumbnailUrl: ART, description: "Selected projects", featured: true }),
    block(id, 1, "link", "Our services", "https://example.com/services", { size: "default" }),
    block(id, 2, "link", "About the studio", "https://example.com/about", { size: "default" }),
    block(id, 3, "embed", "Book an introduction", "https://calendly.com/north-studio/intro", { provider: "calendly", embedId: "north-studio/intro", aspect: "tall", coverUrl: BOOKING_ART }),
  ] : [
    block(id, 0, "link", "Studio portfolio", "https://example.com/studio", { thumbnailUrl: ART, description: "Design projects" }),
    block(id, 1, "link", "Journal", "https://example.com/journal", { description: "Ideas and notes" }),
    block(id, 2, "link", "Book a call", "https://example.com/booking", { featured: true }),
    block(id, 3, "email_capture", null, null, { heading: "Follow the projects", buttonLabel: "Subscribe" }),
  ];
  if (focus) {
    blocks.sort((a, b) => Number(b.type === focus) - Number(a.type === focus));
    blocks.forEach((item, index) => { item.position = index; });
  }
  return { page, blocks, theme: template.defaultTheme };
}
