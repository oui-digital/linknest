"use client";

import { useCallback, useRef, useState } from "react";
import type { InferSelectModel } from "drizzle-orm";
import type { pages } from "@/lib/db/schema";
import type { ThemeTokens } from "@/lib/templates/theme";
import { AvatarFallback } from "@/components/ui/avatar-fallback";
import type { SaveCoordinator, SaveEntity } from "./save-coordinator";
import { BANNER_TEXT_MAX } from "@/lib/banner";

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
  onPageChange: (updates: Partial<Page>) => void;
  onThemeChange: (updates: Partial<ThemeTokens>) => void;
  onError: (message: string) => void;
}

export function PageSettings({
  page,
  plan,
  theme,
  saves,
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
          <span className="text-sm text-gray-500">linknest.click/@{page.slug}</span>
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
