/**
 * Abuse key for a client IP: who counts as "one reporter" or "one signup
 * source".
 *
 * IPv4 addresses are used as-is. An IPv6 address is collapsed to its /64:
 * a single subscriber is normally handed a whole /64 and can rotate through
 * billions of addresses in it, so counting exact IPv6 addresses would let one
 * person look like any number of distinct reporters. IPv4-mapped IPv6
 * (::ffff:192.0.2.1) is treated as the IPv4 address it carries.
 *
 * This is one abuse signal among several (Turnstile, rate limits), not an
 * identity.
 */
export function abuseKeyForIp(raw: string): string {
  const ip = raw.trim().toLowerCase().replace(/%.*$/, ""); // drop an IPv6 zone id
  if (!ip || ip === "unknown") return "unknown";

  if (isIPv4(ip)) return ip;

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped && isIPv4(mapped[1])) return mapped[1];

  const groups = expandIPv6(ip);
  if (!groups) return ip; // not an address we understand; keep it distinct
  const prefix = groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":");
  return `${prefix}::/64`;
}

function isIPv4(ip: string): boolean {
  const parts = ip.split(".");
  return (
    parts.length === 4 &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
  );
}

/** Eight 4-digit hex groups, or null if this is not a valid IPv6 address. */
function expandIPv6(ip: string): string[] | null {
  if (!/^[0-9a-f:.]+$/.test(ip) || (ip.match(/::/g) ?? []).length > 1) return null;

  // An embedded IPv4 tail (e.g. 64:ff9b::192.0.2.1) is two groups.
  let text = ip;
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (tail) {
    if (!isIPv4(tail[1])) return null;
    const [a, b, c, d] = tail[1].split(".").map(Number);
    text =
      text.slice(0, -tail[1].length) +
      `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const [head, rest] = text.split("::");
  const headGroups = head ? head.split(":") : [];
  const restGroups = rest !== undefined && rest !== "" ? rest.split(":") : [];
  const missing = 8 - headGroups.length - restGroups.length;
  if (rest === undefined ? missing !== 0 : missing < 1) return null;

  const groups = [...headGroups, ...Array(rest === undefined ? 0 : missing).fill("0"), ...restGroups];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.padStart(4, "0"));
}
