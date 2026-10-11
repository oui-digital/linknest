import { getAvatarGradient, getInitials } from "@/lib/avatar";

interface AvatarFallbackProps {
  avatarUrl?: string | null;
  name: string;
  slug: string;
  size: number;
  /**
   * Alternative text for the uploaded image. Omit where the avatar is purely
   * decorative (the settings thumbnail next to its own upload controls); the
   * public page passes the owner's description, or the page title.
   */
  alt?: string;
}

export function AvatarFallback({
  avatarUrl,
  name,
  slug,
  size,
  alt,
}: AvatarFallbackProps) {
  const sizeStyle = { width: size, height: size };

  if (avatarUrl) {
    const decorative = alt === undefined;
    return (
      <div
        className="overflow-hidden rounded-full"
        style={sizeStyle}
        {...(decorative ? { "aria-hidden": "true" as const } : {})}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt={alt ?? ""}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  // The initials fallback is always decorative: it repeats the title's
  // initials right above the h1.

  const { gradient, textColor } = getAvatarGradient(slug);
  const initials = getInitials(name);
  const fontSize = Math.round(size * 0.38);

  return (
    <div
      className="flex items-center justify-center rounded-full"
      style={{
        ...sizeStyle,
        background: gradient,
        color: textColor,
        fontSize,
        fontWeight: 700,
        lineHeight: 1,
        userSelect: "none",
      }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
