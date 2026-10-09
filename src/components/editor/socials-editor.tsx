"use client";

import { useRef, useState } from "react";
import { MAX_SOCIAL_ITEMS, type SocialItem } from "@/lib/blocks/content";
import {
  platformName,
  platformPlaceholder,
  resolveSocialInput,
  type SocialPlatformId,
} from "@/lib/social-platforms";
import { SOCIAL_ICONS } from "@/components/blocks/social-icons";

// Most-used first; the rest follow alphabetically, contact methods last.
const CHIP_ORDER: SocialPlatformId[] = [
  "instagram", "tiktok", "youtube", "x", "linkedin", "facebook", "threads", "bluesky",
  "discord", "github", "medium", "patreon", "pinterest", "reddit", "snapchat",
  "soundcloud", "spotify", "telegram", "twitch", "whatsapp", "email", "phone",
];

/**
 * Adding an icon: pick a platform and type a handle, or just paste a link
 * (its host picks the platform). Validation runs here for instant feedback
 * and again on the server, which is authoritative.
 */
export function SocialsEditor({
  items,
  onChange,
}: {
  items: SocialItem[];
  onChange: (items: SocialItem[]) => void;
}) {
  const [platform, setPlatform] = useState<SocialPlatformId | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const full = items.length >= MAX_SOCIAL_ITEMS;

  const add = () => {
    const resolved = resolveSocialInput(value, platform ?? undefined);
    if ("error" in resolved) {
      setError(resolved.error);
      return;
    }
    if (items.some((item) => item.url === resolved.url)) {
      setError("That link is already in the row.");
      return;
    }
    onChange([...items, { platform: resolved.platform, url: resolved.url }]);
    setValue("");
    setError(null);
    inputRef.current?.focus();
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((item, index) => {
            const Icon = SOCIAL_ICONS[item.platform];
            return (
              <li
                key={item.url}
                className="flex items-center gap-2 rounded border border-gray-100 px-2 py-1.5 text-sm"
              >
                <Icon size={16} aria-hidden className="shrink-0 text-gray-600" />
                <span className="shrink-0 font-medium">{platformName(item.platform)}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-gray-400">
                  {item.url.replace(/^(https?:\/\/(www\.)?|mailto:|tel:)/, "")}
                </span>
                <button
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${platformName(item.platform)} earlier`}
                  className="px-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                  aria-label={`Move ${platformName(item.platform)} later`}
                  className="px-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                  aria-label={`Remove ${platformName(item.platform)}`}
                  className="px-1 text-xs text-red-400 hover:text-red-600"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {full ? (
        <p className="text-xs text-gray-400">
          A row holds up to {MAX_SOCIAL_ITEMS} icons. Add another Social icons block for more.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500">
            Add an icon: choose a platform, or paste any profile link
          </p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Platform">
            {CHIP_ORDER.map((id) => {
              const Icon = SOCIAL_ICONS[id];
              const selected = platform === id;
              return (
                <button
                  key={id}
                  role="radio"
                  aria-checked={selected}
                  aria-label={platformName(id)}
                  title={platformName(id)}
                  onClick={() => {
                    setPlatform(selected ? null : id);
                    setError(null);
                    inputRef.current?.focus();
                  }}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                    selected
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Icon size={14} aria-hidden />
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder={
                platform
                  ? `${platformName(platform)}: ${platformPlaceholder(platform)}`
                  : "Paste a link, e.g. instagram.com/you"
              }
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "socials-error" : undefined}
              className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-gray-400"
            />
            <button
              onClick={add}
              disabled={!value.trim()}
              className="rounded border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {error && (
            <p id="socials-error" role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
