"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { InferSelectModel } from "drizzle-orm";
import type { blocks as blocksSchema } from "@/lib/db/schema";
import type { ThemeTokens } from "@/lib/templates/theme";
import {
  VALID_VARIANTS,
  ALL_BUTTON_STYLES,
  type BlockStyleOverrides,
} from "@/lib/templates/theme";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createBlock, deleteBlock, reorderBlocks } from "@/lib/actions/blocks";
import { parseBlockContent, type BlockType, type SocialItem } from "@/lib/blocks/content";
import type { LayoutType } from "@/lib/templates";
import { sizeOptions, type BlockSize } from "@/lib/templates/layout";
import type { SaveCoordinator, SaveStatus } from "./save-coordinator";
import { ImageUpload } from "./image-upload";
import { applyBlockEdit, restoreBlock } from "./block-edit";
import { SocialsEditor } from "./socials-editor";

type Block = InferSelectModel<typeof blocksSchema>;

/**
 * `immediate` skips the typing debounce: toggles, uploads, preset clicks.
 * `contentPatch` changes only those content keys on the latest state; async
 * callbacks (uploads) must use it instead of `updates.content`.
 */
type UpdateOptions = {
  immediate?: boolean;
  contentPatch?: Record<string, unknown>;
  stylePatch?: Partial<BlockStyleOverrides>;
};

const BLOCK_PICKER: { type: BlockType; label: string }[] = [
  { type: "link", label: "Link" },
  { type: "header", label: "Header" },
  { type: "text", label: "Text" },
  { type: "divider", label: "Divider" },
  { type: "image", label: "Image" },
  { type: "socials", label: "Social icons" },
];

const DEFAULT_LABELS: Partial<Record<BlockType, string>> = {
  link: "New Link",
  header: "Heading",
  text: "Text block",
};

interface BlockListProps {
  pageId: string;
  blocks: Block[];
  onBlocksChange: (blocks: Block[]) => void;
  plan: "free" | "pro";
  theme: ThemeTokens;
  layout: LayoutType;
  saves: SaveCoordinator;
  onError: (message: string) => void;
}

export function BlockList({
  pageId,
  blocks,
  onBlocksChange,
  plan,
  theme,
  layout,
  saves,
  onError,
}: BlockListProps) {
  const [isAdding, setIsAdding] = useState(false);
  const sorted = [...blocks].sort((a, b) => a.position - b.position);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = sorted.findIndex((b) => b.id === active.id);
      const newIndex = sorted.findIndex((b) => b.id === over.id);
      const reordered = arrayMove(sorted, oldIndex, newIndex).map((b, i) => ({
        ...b,
        position: i,
      }));

      // Optimistic update, rolled back if the server rejects the new order.
      const previous = blocks;
      onBlocksChange(reordered);

      const result = await reorderBlocks({
        pageId,
        blockIds: reordered.map((b) => b.id),
      });
      if (result?.error) {
        onBlocksChange(previous);
        onError(result.error);
      }
    },
    [sorted, blocks, pageId, onBlocksChange, onError],
  );

  const handleAddBlock = useCallback(
    async (type: BlockType) => {
      setIsAdding(true);
      try {
        const result = await createBlock({
          pageId,
          type,
          label: DEFAULT_LABELS[type],
        });

        if (result.block) {
          onBlocksChange([...blocks, result.block]);
        } else if (result.error) {
          // Previously discarded — which is why the free-tier block-limit
          // upsell was unreachable and the button just stopped working at 50.
          onError(result.error);
        }
      } finally {
        setIsAdding(false);
      }
    },
    [pageId, blocks, onBlocksChange, onError],
  );

  // The list reflects an edit at once; the coordinator sends it after a pause
  // in typing (or immediately for discrete changes), one request in flight per
  // block, and keeps a refused edit flagged on the block instead of rolling the
  // field back. Per-keystroke saves used to burn the mutation budget and reject
  // half-typed URLs.
  //
  // Always applied to the LATEST list (a ref, updated synchronously), never to
  // the list captured when a callback was created: an upload that finishes
  // later must not put back state that was edited in the meantime.
  const latestBlocks = useRef(blocks);
  useEffect(() => {
    latestBlocks.current = blocks;
  }, [blocks]);

  const handleUpdateBlock = useCallback(
    (blockId: string, updates: Partial<Block>, options?: UpdateOptions) => {
      const edit = applyBlockEdit(
        latestBlocks.current,
        blockId,
        updates,
        options?.contentPatch,
        options?.stylePatch,
      );
      latestBlocks.current = edit.blocks;
      onBlocksChange(edit.blocks);

      // Convert null values to what the action's schema expects.
      const patch: Record<string, unknown> = {};
      if (updates.label !== undefined) patch.label = updates.label ?? undefined;
      if (updates.url !== undefined) patch.url = updates.url ?? "";
      if (updates.isVisible !== undefined) patch.isVisible = updates.isVisible;
      if (edit.content !== undefined) patch.content = edit.content;

      saves.enqueue({ kind: "block", id: blockId }, patch, {
        immediate: options?.immediate,
      });
    },
    [onBlocksChange, saves],
  );

  const handleRetry = useCallback(
    (blockId: string) => {
      void saves.retry({ kind: "block", id: blockId });
    },
    [saves],
  );

  const handleDeleteBlock = useCallback(
    async (blockId: string) => {
      const target = blocks.find((b) => b.id === blockId);
      const label = target?.label?.trim();
      const confirmed = window.confirm(
        label
          ? `Delete "${label}"? This can't be undone.`
          : "Delete this block? This can't be undone.",
      );
      if (!confirmed) return;

      if (!target) return;
      const entity = { kind: "block", id: blockId } as const;

      // Hold the block's unsaved edits (neither sent nor dropped) until the
      // server answers: dropped only once the delete is confirmed, restored
      // with their failed/pending state if it is refused. Publishing waits
      // for this answer (SaveCoordinator.holdWhile).
      latestBlocks.current = latestBlocks.current.filter((b) => b.id !== blockId);
      onBlocksChange(latestBlocks.current);

      const request = deleteBlock(blockId).catch(() => ({
        error: "Couldn't delete the block. Please try again.",
      }));
      const held = saves.holdWhile(entity, request.then((r) => !r?.error));
      const result = await request;
      if (result?.error) {
        latestBlocks.current = restoreBlock(latestBlocks.current, target);
        onBlocksChange(latestBlocks.current);
        onError(result.error);
      }
      await held;
    },
    [blocks, saves, onBlocksChange, onError],
  );

  const handleMoveBlock = useCallback(
    async (blockId: string, direction: "up" | "down") => {
      const idx = sorted.findIndex((b) => b.id === blockId);
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= sorted.length) return;

      const reordered = arrayMove(sorted, idx, targetIdx).map((b, i) => ({
        ...b,
        position: i,
      }));

      // Optimistic update
      const previous = blocks;
      onBlocksChange(reordered);

      const result = await reorderBlocks({
        pageId,
        blockIds: reordered.map((b) => b.id),
      });
      if (result?.error) {
        onBlocksChange(previous);
        onError(result.error);
      }
    },
    [sorted, blocks, pageId, onBlocksChange, onError],
  );

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sorted.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          {sorted.map((block, index) => (
            <SortableBlockItem
              key={block.id}
              block={block}
              isFirst={index === 0}
              isLast={index === sorted.length - 1}
              plan={plan}
              theme={theme}
              layout={layout}
              saveStatus={saves.status({ kind: "block", id: block.id })}
              saveError={saves.error({ kind: "block", id: block.id })}
              onUpdate={handleUpdateBlock}
              onDelete={handleDeleteBlock}
              onMove={handleMoveBlock}
              onRetry={handleRetry}
              onError={onError}
            />
          ))}
        </SortableContext>
      </DndContext>

      {sorted.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">
          No blocks yet. Add your first link!
        </p>
      )}
      {sorted.length > 0 && !sorted.some((b) => b.type === "socials") && (
        <p className="text-xs text-gray-400">
          Tip: add Social icons and drag them under your bio.
        </p>
      )}

      {/* Add block buttons */}
      <div className="space-y-2 pt-2">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
          Add block
        </p>
        <div className="grid grid-cols-3 gap-2">
          {BLOCK_PICKER.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => handleAddBlock(type)}
              disabled={isAdding}
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Sortable Block Item ────────────────────────────────────────────────────

function SortableBlockItem({
  block,
  isFirst,
  isLast,
  plan,
  theme,
  layout,
  saveStatus,
  saveError,
  onUpdate,
  onDelete,
  onMove,
  onRetry,
  onError,
}: {
  block: Block;
  isFirst: boolean;
  isLast: boolean;
  plan: "free" | "pro";
  theme: ThemeTokens;
  layout: LayoutType;
  saveStatus: SaveStatus;
  saveError: string | null;
  onUpdate: (id: string, updates: Partial<Block>, options?: UpdateOptions) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onRetry: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Read through the lenient parser so every edit the form sends back only
  // carries keys the server's strict writer accepts.
  const content = useMemo(
    () => parseBlockContent(block.type, block.content),
    [block.type, block.content],
  );
  const overrides = useMemo(
    () => (content.styleOverrides ?? {}) as BlockStyleOverrides,
    [content],
  );
  const imageUrl = (content.imageUrl as string | undefined) ?? block.url ?? null;
  const failed = saveStatus === "failed";

  const handleStyleChange = useCallback(
    (updates: Partial<BlockStyleOverrides>) => {
      // Only the changed keys: merged onto the latest overrides when applied.
      onUpdate(block.id, {}, { immediate: true, stylePatch: updates });
    },
    [block.id, onUpdate],
  );

  const handleResetStyle = useCallback(() => {
    onUpdate(block.id, {}, { immediate: true, contentPatch: { styleOverrides: undefined } });
  }, [block.id, onUpdate]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-white ${failed ? "border-red-300" : "border-gray-200"}`}
    >
      <div className="flex items-center gap-2 p-3">
        {/* Drag handle (desktop only) */}
        <button
          {...attributes}
          {...listeners}
          className="hidden cursor-grab text-gray-400 hover:text-gray-600 md:block"
          aria-label="Drag to reorder"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M5 3h2v2H5zM9 3h2v2H9zM5 7h2v2H5zM9 7h2v2H9zM5 11h2v2H5zM9 11h2v2H9z" />
          </svg>
        </button>

        {/* Arrow buttons (mobile only) */}
        <div className="flex gap-1 md:hidden">
          <button
            onClick={() => onMove(block.id, "up")}
            disabled={isFirst}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
            aria-label="Move up"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 3l-6 6h12z" />
            </svg>
          </button>
          <button
            onClick={() => onMove(block.id, "down")}
            disabled={isLast}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
            aria-label="Move down"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 13l6-6H2z" />
            </svg>
          </button>
        </div>

        {/* Block type badge */}
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-gray-500">
          {block.type}
        </span>

        {/* Label */}
        <span className="flex-1 truncate text-sm">
          {block.type === "socials"
            ? `Social icons · ${((content.items as SocialItem[] | undefined) ?? []).length}`
            : block.label || block.url || block.type}
        </span>

        {/* Save state */}
        {(saveStatus === "pending" || saveStatus === "saving") && (
          <span className="text-[10px] text-gray-400">Saving…</span>
        )}
        {failed && (
          <span className="text-[10px] font-medium text-red-600">Not saved</span>
        )}

        {/* Actions */}
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          {isEditing ? "Done" : "Edit"}
        </button>
        <button
          onClick={() => onDelete(block.id)}
          className="text-xs text-red-400 hover:text-red-600"
        >
          Delete
        </button>
      </div>

      {/* A refused save stays visible, with its reason, until it goes through.
          The edit is kept in the form; nothing is rolled back. */}
      {failed && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          <span>Couldn&apos;t save: {saveError}</span>
          <button
            onClick={() => onRetry(block.id)}
            className="shrink-0 font-medium underline hover:text-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Expanded edit form */}
      {isEditing && (
        <div className="space-y-3 border-t border-gray-100 p-3">
          {(block.type === "link" ||
            block.type === "header" ||
            block.type === "text") && (
            <div>
              <label className="text-xs font-medium text-gray-500">Label</label>
              <input
                type="text"
                value={block.label ?? ""}
                onChange={(e) => onUpdate(block.id, { label: e.target.value })}
                maxLength={255}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-gray-400"
              />
            </div>
          )}
          {block.type === "link" && (
            <div>
              <label className="text-xs font-medium text-gray-500">URL</label>
              <input
                type="url"
                value={block.url ?? ""}
                onChange={(e) => onUpdate(block.id, { url: e.target.value })}
                placeholder="https://"
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-gray-400"
              />
            </div>
          )}
          {block.type === "link" && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-500">
                  Description <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={(content.description as string | undefined) ?? ""}
                  onChange={(e) =>
                    onUpdate(block.id, {}, { contentPatch: { description: e.target.value || undefined } })
                  }
                  rows={2}
                  maxLength={200}
                  placeholder="A short line under the label"
                  className="mt-1 w-full rounded border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-gray-400"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500">
                  Thumbnail <span className="text-gray-400">(optional)</span>
                </label>
                <div className="flex items-center gap-3">
                  <ImageUpload
                    currentUrl={(content.thumbnailUrl as string | undefined) ?? null}
                    uploadType="thumbnail"
                    label={content.thumbnailUrl ? "Replace" : "Upload"}
                    onError={onError}
                    onUpload={(url) =>
                      // contentPatch: merged onto the block as it is when the
                      // upload finishes, not as it was when it started.
                      onUpdate(block.id, {}, { immediate: true, contentPatch: { thumbnailUrl: url } })
                    }
                  />
                  {typeof content.thumbnailUrl === "string" && (
                    <button
                      onClick={() =>
                        onUpdate(block.id, {}, { immediate: true, contentPatch: { thumbnailUrl: undefined } })
                      }
                      className="text-xs text-gray-400 hover:text-red-500"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={content.featured === true}
                  onChange={(e) =>
                    onUpdate(block.id, {}, {
                      immediate: true,
                      contentPatch: { featured: e.target.checked || undefined },
                    })
                  }
                  className="mt-0.5 rounded"
                />
                <span>
                  <span className="text-xs font-medium text-gray-700">Featured button</span>
                  <span className="block text-[11px] text-gray-400">
                    Highlights this link in your theme&apos;s main colour, like a call to action.
                  </span>
                </span>
              </label>
            </>
          )}
          {/* Image blocks had no way to set an image at all: the type could be
              added from the picker but rendered nothing, and ImageUpload was
              imported by no one. */}
          {block.type === "image" && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500">Image</label>
              <ImageUpload
                currentUrl={imageUrl}
                shape="rect"
                label={imageUrl ? "Replace image" : "Upload image"}
                onError={onError}
                onUpload={(url) =>
                  onUpdate(block.id, {}, { immediate: true, contentPatch: { imageUrl: url } })
                }
              />
              <div>
                <label className="text-xs font-medium text-gray-500">
                  Alt text
                </label>
                <input
                  type="text"
                  value={(content.alt as string) ?? ""}
                  onChange={(e) =>
                    onUpdate(block.id, {}, { contentPatch: { alt: e.target.value } })
                  }
                  placeholder="Describe the image for screen readers"
                  maxLength={255}
                  className="mt-1 w-full rounded border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-gray-400"
                />
              </div>
            </div>
          )}
          {block.type === "text" && (
            <div>
              <label className="text-xs font-medium text-gray-500">Text</label>
              <textarea
                value={(content.text as string) ?? block.label ?? ""}
                onChange={(e) =>
                  onUpdate(block.id, {}, { contentPatch: { text: e.target.value } })
                }
                rows={3}
                maxLength={5000}
                placeholder="Write a paragraph…"
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-gray-400"
              />
            </div>
          )}
          {block.type === "socials" && (
            <SocialsEditor
              items={(content.items as SocialItem[] | undefined) ?? []}
              onChange={(items) =>
                onUpdate(block.id, {}, { immediate: true, contentPatch: { items } })
              }
            />
          )}
          {sizeOptions(block.type, layout).length > 0 && (
            <div>
              <span className="text-xs font-medium text-gray-500">Size in grid</span>
              <div className="mt-1 flex gap-1.5" role="radiogroup" aria-label="Size in grid">
                {sizeOptions(block.type, layout).map((size) => {
                  const current = (content.size as BlockSize | undefined) ?? "default";
                  return (
                    <button
                      key={size}
                      role="radio"
                      aria-checked={current === size}
                      onClick={() => {
                        const next: Record<string, unknown> = { ...content };
                        if (size === "default") delete next.size;
                        else next.size = size;
                        onUpdate(block.id, { content: next }, { immediate: true });
                      }}
                      className={`rounded px-2 py-1 text-[11px] font-medium capitalize transition-colors ${
                        current === size
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">Visible</label>
            <input
              type="checkbox"
              checked={block.isVisible}
              onChange={(e) =>
                onUpdate(block.id, { isVisible: e.target.checked }, { immediate: true })
              }
              className="rounded"
            />
          </div>

          {/* Block style editor — link blocks only */}
          {block.type === "link" && (
            <BlockStyleEditor
              overrides={overrides}
              plan={plan}
              theme={theme}
              onChange={handleStyleChange}
              onReset={handleResetStyle}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Block Style Editor ──────────────────────────────────────────────────────

function BlockStyleEditor({
  overrides,
  plan,
  theme,
  onChange,
  onReset,
}: {
  overrides: BlockStyleOverrides;
  plan: "free" | "pro";
  theme: ThemeTokens;
  onChange: (updates: Partial<BlockStyleOverrides>) => void;
  onReset: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  // One timer per colour field. A single shared timer meant that picking a text
  // colour within 500ms of a background colour cancelled the pending background
  // write, silently discarding it.
  const colorDebounceRefs = useRef<
    Partial<Record<"bgColor" | "textColor", ReturnType<typeof setTimeout>>>
  >({});

  useEffect(() => {
    const pending = colorDebounceRefs.current;
    return () => {
      Object.values(pending).forEach(clearTimeout);
    };
  }, []);

  const handleColorChange = useCallback(
    (key: "bgColor" | "textColor", value: string) => {
      clearTimeout(colorDebounceRefs.current[key]);
      colorDebounceRefs.current[key] = setTimeout(() => {
        onChange({ [key]: value });
      }, 500);
    },
    [onChange],
  );

  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <div className="border-t border-gray-100 pt-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between text-xs font-medium text-gray-500"
      >
        <span>Style</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="currentColor"
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          <path d="M6 8L2 4h8z" />
        </svg>
      </button>

      {isOpen && (
        <div className="mt-2 space-y-3">
          {/* Variant presets (all plans) */}
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
              Preset
            </label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <button
                onClick={() => onChange({ variant: undefined })}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  !overrides.variant
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Default
              </button>
              {VALID_VARIANTS.map((v) => (
                <button
                  key={v}
                  onClick={() => onChange({ variant: v })}
                  className={`rounded px-2 py-1 text-[11px] font-medium capitalize transition-colors ${
                    overrides.variant === v
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Pro controls */}
          {plan === "pro" ? (
            <>
              {/* Button style */}
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  Button style
                </label>
                <select
                  value={overrides.buttonStyle ?? ""}
                  onChange={(e) =>
                    onChange({
                      buttonStyle: (e.target.value || undefined) as BlockStyleOverrides["buttonStyle"],
                    })
                  }
                  className="mt-1 w-full rounded border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-gray-400"
                >
                  <option value="">Theme default</option>
                  {ALL_BUTTON_STYLES.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Colors */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                    Background
                  </label>
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      type="color"
                      defaultValue={overrides.bgColor ?? theme.colorSurface}
                      onChange={(e) => handleColorChange("bgColor", e.target.value)}
                      className="h-7 w-7 cursor-pointer rounded border border-gray-200"
                    />
                    <span className="text-[10px] text-gray-400">
                      {overrides.bgColor ?? "auto"}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                    Text
                  </label>
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      type="color"
                      defaultValue={overrides.textColor ?? theme.colorText}
                      onChange={(e) => handleColorChange("textColor", e.target.value)}
                      className="h-7 w-7 cursor-pointer rounded border border-gray-200"
                    />
                    <span className="text-[10px] text-gray-400">
                      {overrides.textColor ?? "auto"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Border radius */}
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  Border radius ({overrides.borderRadius ?? theme.buttonRadius}px)
                </label>
                <input
                  type="range"
                  min={0}
                  max={32}
                  value={overrides.borderRadius ?? theme.buttonRadius}
                  onChange={(e) =>
                    onChange({ borderRadius: Number(e.target.value) })
                  }
                  className="mt-1 w-full"
                />
              </div>

              {/* Shadow */}
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  Shadow
                </label>
                <div className="mt-1 flex gap-1.5">
                  {(["none", "sm", "md"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => onChange({ shadow: s })}
                      className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                        (overrides.shadow ?? "none") === s
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {s === "none" ? "None" : s.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-[11px] text-gray-400">
              Upgrade to Pro for custom colors, button styles, and more.
            </p>
          )}

          {/* Reset */}
          {hasOverrides && (
            <button
              onClick={onReset}
              className="text-[11px] text-gray-400 underline hover:text-gray-600"
            >
              Reset to theme default
            </button>
          )}
        </div>
      )}
    </div>
  );
}
