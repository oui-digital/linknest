import { getAvatarGradient, getInitials } from "@/lib/avatar";

interface AvatarFallbackProps {
  avatarUrl?: string | null;
  name: string;
  slug: string;
  size: number;
}

export function AvatarFallback({
  avatarUrl,
  name,
  slug,
  size,
}: AvatarFallbackProps) {
  const sizeStyle = { width: size, height: size };

  // Decorative on purpose: PageHeader renders the page title as the h1 right
  // below the avatar, so alt="" stops screen readers reading the name twice.
  // If the avatar is ever shown without that title next to it, give it an alt.
  if (avatarUrl) {
    return (
      <div
        className="overflow-hidden rounded-full"
        style={sizeStyle}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

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
