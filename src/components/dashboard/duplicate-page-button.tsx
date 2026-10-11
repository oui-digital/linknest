"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { duplicatePage } from "@/lib/actions/page";

/**
 * Copy a page into a new draft and open it. At the page limit the button
 * becomes the same Pro prompt as "New Page", since the copy would count.
 */
export function DuplicatePageButton({
  pageId,
  canCreate,
  className = "rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-50 disabled:opacity-50",
}: {
  pageId: string;
  canCreate: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canCreate) {
    return (
      <Link href="/pricing" className={className} title="Duplicating needs a free page slot">
        Duplicate
        <span className="ml-1 rounded bg-gray-800 px-1.5 py-0.5 text-[9px] font-bold text-white">
          PRO
        </span>
      </Link>
    );
  }

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await duplicatePage(pageId);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if ("pageId" in result) router.push(`/dashboard/editor/${result.pageId}`);
    } catch {
      setError("Couldn't duplicate the page. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={handleClick} disabled={loading} className={className}>
        {loading ? "Duplicating…" : "Duplicate"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
