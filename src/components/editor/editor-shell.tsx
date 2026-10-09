"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import type { InferSelectModel } from "drizzle-orm";
import type { pages, blocks as blocksSchema } from "@/lib/db/schema";
import type { ThemeTokens } from "@/lib/templates/theme";
import { getTemplate } from "@/lib/templates";
import { updatePage, updateTheme as saveTheme, resetTheme } from "@/lib/actions/page";
import { updateBlock } from "@/lib/actions/blocks";
import { BlockList } from "./block-list";
import { PageSettings } from "./page-settings";
import { ThemeEditor } from "./theme-editor";
import { LivePreview } from "./live-preview";
import { PublishBar } from "./publish-bar";
import { MobilePreviewOverlay } from "./mobile-preview-overlay";
import { useSaveCoordinator } from "./use-save-coordinator";
import type { SaveEntity, SaveOutcome, SavePatch } from "./save-coordinator";
import Link from "next/link";

type Page = InferSelectModel<typeof pages>;
type Block = InferSelectModel<typeof blocksSchema>;

interface EditorShellProps {
  page: Page;
  initialBlocks: Block[];
  plan: "free" | "pro";
}

export function EditorShell({ page, initialBlocks, plan }: EditorShellProps) {
  const [pageState, setPageState] = useState(page);
  const [blocksState, setBlocksState] = useState(initialBlocks);
  const [activeTab, setActiveTab] = useState<"blocks" | "style" | "settings">(
    "blocks",
  );
  const [previewMode, setPreviewMode] = useState<"effective" | "base">(
    "effective",
  );
  const [error, setError] = useState<string | null>(null);

  // The banner had no lifetime: an error from one action stayed pinned while
  // the user moved on to unrelated work, so a stale message looked like a fresh
  // failure of whatever they were doing at the time.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(timer);
  }, [error]);

  // Every block and page-field edit goes through one coordinator (see
  // save-coordinator.ts). It lives here, above the tabs, so switching tabs
  // never discards an edit that has not been sent yet.
  const persist = useCallback(
    async (entity: SaveEntity, patch: SavePatch): Promise<SaveOutcome> => {
      const result =
        entity.kind === "block"
          ? await updateBlock({
              id: entity.id,
              ...patch,
            } as Parameters<typeof updateBlock>[0])
          : await updatePage({
              pageId: page.id,
              ...patch,
            } as Parameters<typeof updatePage>[0]);
      return result?.error ? { ok: false, error: result.error } : { ok: true };
    },
    [page.id],
  );
  const saves = useSaveCoordinator(persist);

  // Derive theme from pageState — single source of truth (no separate theme state)
  const template = useMemo(
    () => getTemplate(pageState.templateId),
    [pageState.templateId],
  );
  // Memoized: `pageState.theme ?? {}` creates a fresh object whenever theme is
  // null, which made every dependent useMemo/useCallback recompute each render.
  const userOverrides = useMemo(
    () => (pageState.theme ?? {}) as Partial<ThemeTokens>,
    [pageState.theme],
  );
  const theme = useMemo(
    () => ({ ...template.defaultTheme, ...userOverrides }) as ThemeTokens,
    [template.defaultTheme, userOverrides],
  );
  const displayTheme = previewMode === "base" ? template.defaultTheme : theme;

  const handlePageUpdate = useCallback(
    (updates: Partial<Page>) => {
      setPageState((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  // Server actions RETURN { error } rather than throwing, so a try/catch alone
  // never rolls back — the optimistic update would stick while the write was
  // rejected, showing a locked Pro feature as if it had applied.
  const handleThemeUpdate = useCallback(
    async (updates: Partial<ThemeTokens>) => {
      const prev = pageState;
      const newOverrides = { ...userOverrides, ...updates };
      setPageState((p) => ({ ...p, theme: newOverrides as Record<string, unknown> }));
      try {
        const result = await saveTheme(pageState.id, updates);
        if (result?.error) {
          setPageState(prev);
          setError(result.error);
        }
      } catch {
        setPageState(prev);
        setError("Couldn't save your style change. Please try again.");
      }
    },
    [pageState, userOverrides],
  );

  const handleTemplateChange = useCallback(
    async (templateId: string) => {
      const prev = pageState;
      setPageState((p) => ({ ...p, templateId }));
      try {
        const result = await updatePage({ pageId: pageState.id, templateId });
        if (result?.error) {
          setPageState(prev);
          setError(result.error);
        }
      } catch {
        setPageState(prev);
        setError("Couldn't switch template. Please try again.");
      }
    },
    [pageState],
  );

  const handleResetOverrides = useCallback(async () => {
    const prev = pageState;
    setPageState((p) => ({ ...p, theme: {} as Record<string, unknown> }));
    try {
      const result = await resetTheme(pageState.id);
      if (result?.error) {
        setPageState(prev);
        setError(result.error);
      }
    } catch {
      setPageState(prev);
      setError("Couldn't reset your theme. Please try again.");
    }
  }, [pageState]);

  const handleBlocksUpdate = useCallback((newBlocks: Block[]) => {
    setBlocksState(newBlocks);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            &larr; Back
          </Link>
          <span className="text-sm font-medium">{pageState.title}</span>
        </div>
        <PublishBar
          page={pageState}
          saves={saves}
          onPageChange={handlePageUpdate}
          onError={setError}
        />
      </header>

      {/* Error banner — the editor previously surfaced failures only via
          alert(), or not at all, so rejected saves looked like successes. */}
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-4 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="shrink-0 font-medium text-red-600 hover:text-red-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main editor area. <main> so the landmark tree has a main region to
          bypass the header to — this is the route with repeated navigation. */}
      <main className="flex flex-1 overflow-hidden">
        {/* Left panel — editing controls */}
        <div className="flex w-full flex-col overflow-y-auto border-r border-gray-200 bg-white md:w-[420px]">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            {(["blocks", "style", "settings"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-3 text-sm font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? "border-b-2 border-black text-black"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === "blocks" && (
              <BlockList
                pageId={page.id}
                blocks={blocksState}
                onBlocksChange={handleBlocksUpdate}
                plan={plan}
                theme={theme}
                saves={saves}
                onError={setError}
              />
            )}
            {activeTab === "style" && (
              <ThemeEditor
                pageId={page.id}
                theme={theme}
                themeBase={template.defaultTheme}
                userOverrides={userOverrides}
                plan={plan}
                templateId={pageState.templateId}
                previewMode={previewMode}
                onPreviewModeChange={setPreviewMode}
                onThemeChange={handleThemeUpdate}
                onTemplateChange={handleTemplateChange}
                onResetOverrides={handleResetOverrides}
              />
            )}
            {activeTab === "settings" && (
              <PageSettings
                page={pageState}
                plan={plan}
                theme={theme}
                saves={saves}
                onPageChange={handlePageUpdate}
                onThemeChange={handleThemeUpdate}
                onError={setError}
              />
            )}
          </div>
        </div>

        {/* Right panel — live preview */}
        <div className="hidden flex-1 items-center justify-center bg-gray-100 p-8 md:flex">
          <LivePreview page={pageState} blocks={blocksState} theme={displayTheme} />
        </div>
      </main>

      {/* Mobile preview overlay */}
      <MobilePreviewOverlay page={pageState} blocks={blocksState} theme={displayTheme} />
    </div>
  );
}
