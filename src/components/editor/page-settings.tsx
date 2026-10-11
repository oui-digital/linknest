"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { InferSelectModel } from "drizzle-orm";
import type { pages } from "@/lib/db/schema";
import type { ThemeTokens } from "@/lib/templates/theme";
import { AvatarFallback } from "@/components/ui/avatar-fallback";
import { ImageUpload } from "./image-upload";
import type { SaveCoordinator, SaveEntity } from "./save-coordinator";
import { BANNER_TEXT_MAX } from "@/lib/banner";
import { LANGUAGES, pageLanguage } from "@/lib/languages";
import { AVATAR_ALT_MAX } from "@/lib/page-schema";
import { duplicatePage } from "@/lib/actions/page";

type Page = InferSelectModel<typeof pages>;

// Matches the zod limits in src/lib/actions/page.ts — without these the input
// silently accepts more than the server will store.
const MAX_TITLE = 255;
const MAX_BIO = 500;

const PAGE: SaveEntity = { kind: "page" };

interface PageSettingsProps {
  page: Page;
  plan: "free" | "pro";
  theme: ThemeTokens;
  saves: SaveCoordinator;
  /** Host of the public URL, resolved server-side from SITE_URL. */
  publicHost: string;
  onPageChange: (updates: Partial<Page>) => void;
  onThemeChange: (updates: Partial<ThemeTokens>) => void;
  onError: (message: string) => void;
}

export function PageSettings({
  page,
  plan,
  theme,
  saves,
  publicHost,
  onPageChange,
  onThemeChange,
  onError,
}: PageSettingsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [touched, setTouched] = useState(false);

  // Edits are applied to the shell's state at once and handed to the shared
  // save coordinator, which debounces, serialises and retries them. The panel
  // used to keep its own per-field timers and clear them on unmount, so
  // switching tabs within 600ms of typing silently dropped the edit.
  const handleSave = useCallback(
    (field: string, value: string) => {
      setTouched(true);
      onPageChange({ [field]: value } as Partial<Page>);
      saves.enqueue(PAGE, { [field]: value });
    },
    [saves, onPageChange],
  );

  // The inputs keep what was typed (a link typed before any text survives);
  // what is saved and previewed is null until there is text.
  const [bannerDraft, setBannerDraft] = useState({
    text: page.banner?.text ?? "",
    url: page.banner?.url ?? "",
  });
  const handleBanner = useCallback(
    (draft: { text: string; url: string }) => {
      setBannerDraft(draft);
      setTouched(true);
      const banner = draft.text.trim()
        ? { text: draft.text.trim(), url: draft.url.trim() || null }
        : null;
      onPageChange({ banner } as Partial<Page>);
      saves.enqueue(PAGE, { banner });
    },
    [saves, onPageChange],
  );

  const handleAvatarUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", "avatar");

        const res = await fetch("/api/upload/image", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Upload failed");
        }

        const { url } = await res.json();
        setTouched(true);
        onPageChange({ avatarUrl: url } as Partial<Page>);
        saves.enqueue(PAGE, { avatarUrl: url }, { immediate: true });
      } catch (error) {
        console.error("Avatar upload error:", error);
        onError(
          error instanceof Error
            ? error.message
            : "Couldn't upload that image. Please try again.",
        );
      } finally {
        setUploading(false);
      }
    },
    [saves, onPageChange, onError],
  );

  const handleRemoveAvatar = useCallback(() => {
    setTouched(true);
    onPageChange({ avatarUrl: "" } as Partial<Page>);
    saves.enqueue(PAGE, { avatarUrl: "" }, { immediate: true });
  }, [saves, onPageChange]);

  // Uploaded images are saved at once; "" clears the field (the action maps
  // it to null).
  const handleImageField = useCallback(
    (field: "ogImageUrl" | "faviconUrl", url: string) => {
      setTouched(true);
      onPageChange({ [field]: url || null } as Partial<Page>);
      saves.enqueue(PAGE, { [field]: url }, { immediate: true });
    },
    [saves, onPageChange],
  );

  // Copying waits for every pending save, exactly like publishing: a click
  // inside the typing debounce must not copy the page as it was a moment ago.
  const router = useRouter();
  const [duplicating, setDuplicating] = useState(false);
  const handleDuplicate = useCallback(async () => {
    setDuplicating(true);
    try {
      const flushed = await saves.flushAll();
      if (!flushed.ok) {
        onError("Fix the highlighted change before duplicating.");
        return;
      }
      const result = await duplicatePage(page.id);
      if ("error" in result && result.error) {
        onError(result.error);
        return;
      }
      if ("pageId" in result) router.push(`/dashboard/editor/${result.pageId}`);
    } catch {
      onError("Couldn't duplicate the page. Please try again.");
    } finally {
      setDuplicating(false);
    }
  }, [saves, page.id, router, onError]);

  const status = saves.status(PAGE);
  const saveLabel =
    status === "pending" || status === "saving"
      ? "Saving…"
      : status === "failed"
        ? "Couldn't save"
        : touched
          ? "Saved"
          : "";

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <section>
        <h3 className="mb-3 text-sm font-semibold">Avatar</h3>
        <div className="flex items-center gap-4">
          <div
            className="cursor-pointer"
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <AvatarFallback
              avatarUrl={page.avatarUrl}
              name={page.title}
              slug={page.slug}
              size={64}
            />
          </div>
          <div className="flex flex-col gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-left text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload image"}
            </button>
            {page.avatarUrl && (
              <button
                onClick={handleRemoveAvatar}
                disabled={uploading}
                className="text-left text-xs text-gray-400 hover:text-red-500 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleAvatarUpload(file);
              e.target.value = "";
            }}
          />
        </div>
      </section>

      {/* Avatar description */}
      <section>
        <label className="text-xs font-medium text-gray-500">
          Describe your photo{" "}
          <span className="text-gray-400">
            (alt text, {(page.avatarAlt ?? "").length}/{AVATAR_ALT_MAX})
          </span>
        </label>
        <input
          type="text"
          value={page.avatarAlt ?? ""}
          onChange={(e) => handleSave("avatarAlt", e.target.value)}
          maxLength={AVATAR_ALT_MAX}
          placeholder={`e.g. ${page.title} smiling in the studio`}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
        />
        <p className="mt-1 text-xs text-gray-400">
          Read aloud by screen readers. Leave empty to use your page title.
        </p>
      </section>

      {/* Page info */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Page Info</h3>
          <span
            aria-live="polite"
            className={`text-xs ${status === "failed" ? "text-red-600" : "text-gray-400"}`}
          >
            {saveLabel}
          </span>
        </div>
        {status === "failed" && (
          <p
            role="alert"
            className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            <span>Couldn&apos;t save: {saves.error(PAGE)}</span>
            <button
              onClick={() => void saves.retry(PAGE)}
              className="font-medium underline hover:text-red-900"
            >
              Retry
            </button>
          </p>
        )}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">
              Title{" "}
              <span className="text-gray-400">
                ({page.title.length}/{MAX_TITLE})
              </span>
            </label>
            <input
              type="text"
              value={page.title}
              onChange={(e) => handleSave("title", e.target.value)}
              maxLength={MAX_TITLE}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">
              Bio{" "}
              <span className="text-gray-400">
                ({(page.bio ?? "").length}/{MAX_BIO})
              </span>
            </label>
            <textarea
              value={page.bio ?? ""}
              onChange={(e) => handleSave("bio", e.target.value)}
              maxLength={MAX_BIO}
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              placeholder="Tell visitors about yourself..."
            />
          </div>
        </div>
      </section>

      {/* SEO */}
      <section>
        <h3 className="mb-3 text-sm font-semibold">SEO</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">
              SEO Title{" "}
              <span className="text-gray-400">
                ({(page.seoTitle ?? "").length}/70)
              </span>
            </label>
            <input
              type="text"
              value={page.seoTitle ?? ""}
              onChange={(e) => handleSave("seoTitle", e.target.value)}
              maxLength={70}
              placeholder={page.title}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">
              SEO Description{" "}
              <span className="text-gray-400">
                ({(page.seoDescription ?? "").length}/160)
              </span>
            </label>
            <textarea
              value={page.seoDescription ?? ""}
              onChange={(e) => handleSave("seoDescription", e.target.value)}
              maxLength={160}
              rows={2}
              placeholder="A brief description for search engines..."
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
          </div>
        </div>
      </section>

      {/* Language and subject */}
      <section>
        <h3 className="mb-3 text-sm font-semibold">Language</h3>
        <div className="space-y-3">
          <div>
            <label htmlFor="page-language" className="text-xs font-medium text-gray-500">
              Your page is written in
            </label>
            <select
              id="page-language"
              value={pageLanguage(page.language)}
              onChange={(e) => handleSave("language", e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Tells browsers, screen readers and search engines what language to expect.
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-gray-500">This page represents</span>
            <div className="mt-1 flex gap-1.5" role="radiogroup" aria-label="This page represents">
              {(
                [
                  ["person", "A person"],
                  ["organization", "A business or organization"],
                ] as const
              ).map(([kind, label]) => {
                const current = page.entityKind === "organization" ? "organization" : "person";
                return (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={current === kind}
                    onClick={() => handleSave("entityKind", kind)}
                    className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      current === kind
                        ? "bg-gray-900 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Used in the structured data search engines read.
            </p>
          </div>
        </div>
      </section>

      {/* Social image and favicon */}
      <section>
        <h3 className="mb-1 text-sm font-semibold">Sharing and icon</h3>
        <p className="mb-3 text-xs text-gray-400">
          Without your own image, shares get a card drawn from your page, and the tab shows the LinkNest icon.
        </p>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500">Social preview image (1200×630)</label>
            <div className="mt-1 flex items-center gap-3">
              <ImageUpload
                currentUrl={page.ogImageUrl}
                uploadType="og"
                shape="rect"
                label={page.ogImageUrl ? "Replace" : "Upload"}
                onError={onError}
                onUpload={(url) => handleImageField("ogImageUrl", url)}
              />
              {page.ogImageUrl && (
                <button
                  type="button"
                  onClick={() => handleImageField("ogImageUrl", "")}
                  className="text-xs text-gray-400 hover:text-red-500"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Favicon (square)</label>
            <div className="mt-1 flex items-center gap-3">
              <ImageUpload
                currentUrl={page.faviconUrl}
                uploadType="favicon"
                shape="circle"
                label={page.faviconUrl ? "Replace" : "Upload"}
                onError={onError}
                onUpload={(url) => handleImageField("faviconUrl", url)}
              />
              {page.faviconUrl && (
                <button
                  type="button"
                  onClick={() => handleImageField("faviconUrl", "")}
                  className="text-xs text-gray-400 hover:text-red-500"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Announcement banner */}
      <section>
        <h3 className="mb-1 text-sm font-semibold">Announcement banner</h3>
        <p className="mb-3 text-xs text-gray-400">
          A bar pinned to the top of your page, in your theme&apos;s main colour. Visitors can dismiss it.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">
              Text{" "}
              <span className="text-gray-400">
                ({bannerDraft.text.length}/{BANNER_TEXT_MAX})
              </span>
            </label>
            <input
              type="text"
              value={bannerDraft.text}
              onChange={(e) => handleBanner({ ...bannerDraft, text: e.target.value })}
              maxLength={BANNER_TEXT_MAX}
              placeholder="e.g. New album out Friday"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">
              Link <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="url"
              value={bannerDraft.url}
              onChange={(e) => handleBanner({ ...bannerDraft, url: e.target.value })}
              placeholder="https://"
              disabled={!bannerDraft.text.trim()}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 disabled:bg-gray-50"
            />
          </div>
          {page.banner && (
            <button
              onClick={() => handleBanner({ text: "", url: "" })}
              className="text-xs text-gray-400 hover:text-red-500"
            >
              Remove banner
            </button>
          )}
        </div>
      </section>

      {/* Public URL */}
      <section>
        <h3 className="mb-3 text-sm font-semibold">Public URL</h3>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <span className="text-sm text-gray-500">{publicHost}/@{page.slug}</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(
                `${window.location.origin}/@${page.slug}`,
              );
            }}
            className="ml-auto text-xs text-gray-400 hover:text-gray-600"
          >
            Copy
          </button>
        </div>
      </section>

      {/* Visitors — every plan */}
      <section>
        <h3 className="mb-3 text-sm font-semibold">Visitors</h3>
        <label className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm">
              Help visitors leave the Instagram and Facebook in-app browser
            </span>
            <p className="text-xs text-gray-400">
              Shows a small &quot;Open in browser&quot; bar when your page is opened inside
              Instagram, Facebook, Messenger or Threads
            </p>
          </div>
          <input
            type="checkbox"
            checked={!theme.hideInAppBrowserPrompt}
            onChange={(e) => onThemeChange({ hideInAppBrowserPrompt: !e.target.checked })}
            className="h-4 w-4 rounded border-gray-300"
          />
        </label>
      </section>

      {/* Duplicate */}
      <section>
        <h3 className="mb-1 text-sm font-semibold">Duplicate this page</h3>
        <p className="mb-3 text-xs text-gray-400">
          Start a French version, or a variant for another audience, from a copy of this page.
          The copy is a draft with its own address.
        </p>
        <button
          type="button"
          onClick={handleDuplicate}
          disabled={duplicating || saves.hasFailed() || saves.isHolding()}
          title={saves.hasFailed() ? "A change could not be saved. Fix it before duplicating." : undefined}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          {duplicating ? "Duplicating…" : "Duplicate page"}
        </button>
      </section>

      {/* Branding */}
      {plan === "pro" && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">Branding</h3>
          <label className="flex items-center justify-between gap-3">
            <div>
              <span className="text-sm">Hide &quot;Made with LinkNest&quot;</span>
              <p className="text-xs text-gray-400">
                Remove the LinkNest badge from your public page
              </p>
            </div>
            <input
              type="checkbox"
              checked={theme.hideBranding ?? false}
              // onThemeChange already persists via the shell's handleThemeUpdate;
              // calling saveTheme here too issued a second, redundant write.
              onChange={(e) => onThemeChange({ hideBranding: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
          </label>
        </section>
      )}
    </div>
  );
}
