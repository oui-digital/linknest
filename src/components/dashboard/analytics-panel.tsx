"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AnalyticsResponse } from "@/app/api/analytics/route";
import { ANALYTICS_RANGES } from "@/lib/analytics";
import { BarSparkline, formatClicksPerView } from "./bar-sparkline";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: AnalyticsResponse };

const STATUS_NOTE: Record<string, string> = {
  hidden: "hidden",
  deleted: "deleted",
};

export function AnalyticsPanel({
  slug,
  maxDays,
  isPro,
}: {
  slug: string;
  maxDays: number;
  isPro: boolean;
}) {
  const [days, setDays] = useState(Math.min(30, maxDays));
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/analytics?slug=${encodeURIComponent(slug)}&days=${days}&view=full`)
      .then(async (res) => {
        const body = (await res.json()) as AnalyticsResponse;
        if (cancelled) return;
        if (!res.ok || body.error) {
          setState({ status: "error", message: body.error ?? "Analytics are temporarily unavailable." });
        } else {
          setState({ status: "ready", data: body });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", message: "Couldn't load analytics. Check your connection." });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, days]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date range">
        {ANALYTICS_RANGES.map((range) => {
          const locked = range > maxDays;
          return (
            <button
              key={range}
              onClick={() => {
                if (range === days) return;
                setState({ status: "loading" });
                setDays(range);
              }}
              disabled={locked}
              aria-pressed={days === range}
              title={locked ? "Longer history is included with Pro" : undefined}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                days === range
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              }`}
            >
              {range} days
            </button>
          );
        })}
        {!isPro && (
          <Link href="/pricing" className="text-xs text-gray-500 underline hover:text-gray-800">
            Upgrade for {ANALYTICS_RANGES.at(-1)} days of history
          </Link>
        )}
      </div>

      {state.status === "loading" && <div className="h-64 animate-pulse rounded-xl bg-gray-100" />}
      {state.status === "error" && (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">{state.message}</p>
      )}
      {state.status === "ready" && <Report data={state.data} />}
    </div>
  );
}

function Report({ data }: { data: AnalyticsResponse }) {
  if (!data.configured) {
    return (
      <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Analytics are temporarily unavailable.
      </p>
    );
  }
  const topLinks = data.topLinks ?? [];
  const topSources = data.topSources ?? [];

  return (
    <>
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <dl className="mb-6 grid grid-cols-3 gap-4">
          <Stat label={`Views (${data.days} days)`} value={(data.views.total ?? 0).toLocaleString()} />
          <Stat label="Link clicks" value={(data.clicks.total ?? 0).toLocaleString()} />
          <Stat label="Clicks per view" value={formatClicksPerView(data.clicksPerView)} />
        </dl>
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-medium text-gray-500">Views per day</p>
            <BarSparkline values={data.views.daily} labels={data.labels} showTicks={false}
              ariaLabel={`${data.views.total ?? 0} views over ${data.days} days`} />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-gray-500">Link clicks per day</p>
            <BarSparkline values={data.clicks.daily} labels={data.labels} color="bg-gray-500"
              ariaLabel={`${data.clicks.total ?? 0} link clicks over ${data.days} days`} />
          </div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-gray-400">
          Clicks per view = total link clicks ÷ page views in the range. One visitor clicking three
          links counts three times, so this can exceed 100%. It is not a unique-visitor conversion rate.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold">Top links</h2>
        {topLinks.length === 0 ? (
          <p className="text-sm text-gray-400">No link clicks in this range yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400">
                <th className="pb-2 font-medium">Link</th>
                <th className="pb-2 text-right font-medium">Clicks</th>
              </tr>
            </thead>
            <tbody>
              {topLinks.map((link) => (
                <TopLinkRows key={link.id} link={link} />
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold">Top sources</h2>
        {topSources.length === 0 ? (
          <p className="text-sm text-gray-400">No views in this range yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400">
                <th className="pb-2 font-medium">Referring site</th>
                <th className="pb-2 text-right font-medium">Views</th>
              </tr>
            </thead>
            <tbody>
              {topSources.map((row) => (
                <tr key={row.source} className="border-t border-gray-100">
                  <td className="py-2">
                    {row.source || (
                      <span
                        className="text-gray-500"
                        title="Browsers omit the referrer for typed addresses, many apps and some privacy settings."
                      >
                        Direct / unknown
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">{row.views.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-gray-400">
          Only the referring site&apos;s domain is recorded. Views from before referrer tracking show as
          Direct / unknown.
        </p>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-2xl font-bold">{value}</dd>
    </div>
  );
}

function TopLinkRows({ link }: { link: NonNullable<AnalyticsResponse["topLinks"]>[number] }) {
  const note = STATUS_NOTE[link.status];
  return (
    <>
      <tr className="border-t border-gray-100">
        <td className="py-2">
          {link.label}
          {note && <span className="ml-2 text-xs text-gray-400">({note})</span>}
          {link.plays > 0 && (
            <span className="ml-2 text-xs text-gray-400">{link.plays.toLocaleString()} plays</span>
          )}
        </td>
        <td className="py-2 text-right tabular-nums">{link.clicks.toLocaleString()}</td>
      </tr>
      {link.children?.map((child) => (
        <tr key={child.url}>
          <td className="py-1 pl-4 text-xs text-gray-500">{child.label}</td>
          <td className="py-1 text-right text-xs tabular-nums text-gray-500">{child.clicks.toLocaleString()}</td>
        </tr>
      ))}
    </>
  );
}
