"use client";

import { useState, useRef, useCallback } from "react";

interface ImageUploadProps {
  currentUrl?: string | null;
  onUpload: (url: string) => void;
  onError?: (message: string) => void;
  label?: string;
  className?: string;
  /** Avatars are round; block images keep their aspect ratio. */
  shape?: "circle" | "rect";
  /** Server-side processing preset (see src/lib/image-processing.ts). */
  uploadType?: "avatar" | "thumbnail";
}

export function ImageUpload({
  currentUrl,
  onUpload,
  onError,
  label = "Upload Image",
  className = "",
  shape = "circle",
  uploadType,
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Instant preview
      setPreview(URL.createObjectURL(file));
      setIsUploading(true);

      try {
        // Upload via FormData to server-side processing route
        const formData = new FormData();
        formData.append("file", file);
        if (uploadType) formData.append("type", uploadType);

        const res = await fetch("/api/upload/image", {
          method: "POST",
          body: formData,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setPreview(null);
          onError?.(data.error || "Upload failed. Please try again.");
          return;
        }

        // Return the public URL
        onUpload(data.url);
      } catch {
        setPreview(null);
        onError?.("Upload failed. Please try again.");
      } finally {
        setIsUploading(false);
        // Allow re-selecting the same file after a failure.
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [onUpload, onError, uploadType],
  );

  const displayUrl = preview || currentUrl;

  return (
    <div className={className}>
      {displayUrl && (
        <div
          className={
            shape === "circle"
              ? "mb-2 h-20 w-20 overflow-hidden rounded-full border border-gray-200"
              : "mb-2 max-h-40 w-full overflow-hidden rounded-lg border border-gray-200"
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt="Preview"
            className={
              shape === "circle"
                ? "h-full w-full object-cover"
                : "h-auto w-full object-contain"
            }
          />
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        // No SVG: the upload route rejects it anyway (SVG can carry <script>),
        // so offering it in the picker only produces a confusing failure.
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-gray-50 disabled:opacity-50"
      >
        {isUploading ? "Uploading..." : label}
      </button>
    </div>
  );
}
