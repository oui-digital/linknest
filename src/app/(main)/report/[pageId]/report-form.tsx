"use client";

import { useRef, useState } from "react";
import {
  TurnstileWidget,
  turnstileSatisfied,
  type TurnstileHandle,
} from "@/components/auth/turnstile-widget";
import type { TurnstileClientConfig } from "@/lib/turnstile-types";

const REASONS = [
  { value: "phishing", label: "Phishing / Scam" },
  { value: "malware", label: "Malware / Harmful links" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Other" },
];

export function ReportForm({
  pageId,
  turnstile,
}: {
  pageId: string;
  turnstile: TurnstileClientConfig;
}) {
  const [reason, setReason] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const widget = useRef<TurnstileHandle>(null);
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;

    setStatus("sending");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, reason, details, turnstileToken: token }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("sent");
      } else {
        setErrorMsg(data.error || "Failed to submit report");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    } finally {
      // Turnstile tokens are single-use: a retry needs a fresh one.
      widget.current?.reset();
    }
  };

  if (status === "sent") {
    return (
      <div className="mt-6 rounded-lg bg-green-50 p-4 text-sm text-green-800">
        Thank you for your report. We&apos;ll review this page shortly.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium">Reason</label>
        <div className="space-y-2">
          {REASONS.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={(e) => setReason(e.target.value)}
                className="accent-black"
              />
              {r.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Details (optional)
        </label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Any additional context..."
          rows={3}
          maxLength={1000}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
      </div>

      <TurnstileWidget ref={widget} config={turnstile} action="report" onToken={setToken} />

      {status === "error" && (
        <p className="text-sm text-red-600">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={!reason || status === "sending" || !turnstileSatisfied(turnstile, token)}
        className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
      >
        {status === "sending" ? "Submitting..." : "Submit Report"}
      </button>
    </form>
  );
}
