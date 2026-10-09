"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AnalyticsResponse } from "@/app/api/analytics/route";
import { BarSparkline, formatClicksPerView } from "./bar-sparkline";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: AnalyticsResponse };

export function AnalyticsCard({
  pageId,
  slug,
  title,
}: {
  pageId: string;
  slug: string;
  title?: string;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/analytics?slug=${encodeURIComponent(slug)}&view=summary`)
      .then(async (res) => {
        const body = (await res.json()) as AnalyticsResponse;
        if (cancelled) return;
        if (!res.ok || body.error) {
          setState({
            status: "error",
            message: body.error ?? "Analytics are temporarily unavailable.",
          });
          return;
        }
        setState({ status: "ready", data: body });
      })
      // A rejected fetch used to leave the card pulsing forever, which reads as
      // "still loading" rather than "this failed".
      .catch(() => {
        if (!cancelled) {
          setState({
            status: "error",
            message: "Couldn't load analytics. Check your connection.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const heading = title ? `${title} — @${slug}` : `@${slug}`;
  const detailsLink = (
    <Link
      href={`/dashboard/analytics/${pageId}`}
      className="text-xs font-medium text-gray-500 hover:text-gray-900"
    >
      View details &rarr;
    </Link>
  );

  if (state.status === "loading") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="mb-3 text-xs font-medium text-gray-400">{heading}</p>
        <div className="h-20 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="mb-2 text-xs font-medium text-gray-400">{heading}</p>
        <p className="text-sm text-gray-500">{state.message}</p>
      </div>
    );
  }

  const { data } = state;
  const fmt = (n: number | null) => (data.configured ? (n ?? 0).toLocaleString() : "—");

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      {/* The page each card belongs to — with several pages these were
          previously an unlabelled stack of identical cards. */}
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-xs font-medium text-gray-400">{heading}</p>
        {detailsLink}
      </div>

      <div className="mb-4 flex items-baseline justify-between">
        <div className="flex gap-8">
          <div>
            <p className="text-sm text-gray-500">Views ({data.days} days)</p>
            <p className="text-2xl font-bold">{fmt(data.views.total)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Link clicks</p>
            <p className="text-2xl font-bold">{fmt(data.clicks.total)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500" title="Total link clicks divided by views">
              Clicks per view
            </p>
            <p className="text-2xl font-bold">
              {data.configured ? formatClicksPerView(data.clicksPerView) : "—"}
            </p>
          </div>
        </div>
        {!data.configured && (
          // Not "not set up yet" — that reads as the account owner's to-do,
          // when it is actually a server-side configuration gap they cannot fix.
          <span className="text-xs text-gray-400">
            Analytics temporarily unavailable
          </span>
        )}
      </div>

      <BarSparkline
        values={data.views.daily}
        labels={data.labels}
        ariaLabel={`${data.views.total ?? 0} views over the last ${data.days} days`}
      />
    </div>
  );
}
