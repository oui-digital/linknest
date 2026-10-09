"use client";

import { useState } from "react";

/**
 * One button that POSTs the token from the email link. Opening the link never
 * changes anything by itself: mail scanners prefetch links, and a GET that
 * confirmed or unsubscribed would act on the reader's behalf.
 */
export function TokenAction({
  endpoint,
  payload,
  buttonLabel,
  doneMessage,
}: {
  endpoint: string;
  payload: Record<string, string>;
  buttonLabel: string;
  doneMessage: string;
}) {
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  if (status === "done") {
    return (
      <p role="status" className="mt-6 rounded-lg bg-green-50 p-4 text-sm text-green-800">
        {doneMessage}
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <button
        onClick={async () => {
          setStatus("sending");
          try {
            const res = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
              setStatus("done");
            } else {
              setError(data.error || "Something went wrong. Please try again.");
              setStatus("error");
            }
          } catch {
            setError("Network error. Please try again.");
            setStatus("error");
          }
        }}
        disabled={status === "sending"}
        className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
      >
        {status === "sending" ? "Working…" : buttonLabel}
      </button>
      {status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
