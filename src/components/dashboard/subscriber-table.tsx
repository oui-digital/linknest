"use client";

import { useState, useTransition } from "react";
import { deleteSubscriberAction } from "@/lib/actions/subscribers";

type Row = { id: string; email: string; status: string; pageSlug: string; date: string };

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  pending: "Awaiting confirmation",
  unsubscribed: "Unsubscribed",
};

export function SubscriberTable({ rows }: { rows: Row[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const visible = rows.filter((r) => !hidden.has(r.id));

  if (visible.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">
        No subscribers yet. Add an Email sign-up block to a page to start a list.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      {error && (
        <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-400">
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Page</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.id} className="border-t border-gray-100">
              <td className="px-4 py-2 break-all">{row.email}</td>
              <td className="px-4 py-2 text-gray-600">{STATUS_LABEL[row.status] ?? row.status}</td>
              <td className="px-4 py-2 text-gray-600">@{row.pageSlug}</td>
              <td className="px-4 py-2 text-gray-600">{new Date(row.date).toLocaleDateString()}</td>
              <td className="px-4 py-2 text-right">
                <button
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`Delete ${row.email}? This can't be undone.`)) return;
                    startTransition(async () => {
                      const result = await deleteSubscriberAction(row.id);
                      if (result?.error) setError(result.error);
                      else setHidden((prev) => new Set(prev).add(row.id));
                    });
                  }}
                  className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
