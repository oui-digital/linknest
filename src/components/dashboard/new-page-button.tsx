"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function NewPageButton({
  workspaceId,
  canCreate,
  publicHost,
}: {
  workspaceId: string;
  canCreate: boolean;
  /** Host shown before the handle, computed server-side from SITE_URL: only
   *  NEXT_PUBLIC_* reaches client bundles, so previews would otherwise show
   *  localhost here. */
  publicHost: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!canCreate) {
    return (
      <Link
        href="/pricing"
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-50"
      >
        + New Page
        <span className="ml-1 rounded bg-gray-800 px-1.5 py-0.5 text-[9px] font-bold text-white">
          PRO
        </span>
      </Link>
    );
  }

  const handleCreate = async () => {
    if (!title.trim() || !slug.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), slug: slug.trim(), workspaceId }),
      });
      const data = await res.json();

      if (res.ok && data.page?.id) {
        router.push(`/dashboard/editor/${data.page.id}`);
        return;
      }

      // Previously this branch did nothing at all and never cleared `loading`,
      // so any failure — including the "Page limit reached, upgrade to Pro"
      // upsell — left the button stuck on "Creating…" with no explanation.
      setError(
        typeof data.error === "string"
          ? data.error
          : "Couldn't create that page. Please try again.",
      );
      setLoading(false);
    } catch {
      setError("Couldn't reach the server. Check your connection.");
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
      >
        + New Page
      </button>

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-[400px] rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">Create New Page</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Page Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="My Links"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  URL Slug
                </label>
                <div className="flex items-center rounded-lg border border-gray-200 px-3 py-2">
                  <span className="text-sm text-gray-400">{publicHost}/@</span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) =>
                      // No underscore: SLUG_REGEX in src/lib/slugs.ts allows
                      // only [a-z0-9-], so permitting "_" here produced input
                      // the server was guaranteed to reject.
                      setSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, ""),
                      )
                    }
                    placeholder="yourname"
                    className="flex-1 border-0 bg-transparent text-sm outline-none"
                  />
                </div>
              </div>
            </div>

            {error && (
              <p role="alert" className="mt-4 text-sm text-red-600">
                {error}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowDialog(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={loading || !title.trim() || !slug.trim()}
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
