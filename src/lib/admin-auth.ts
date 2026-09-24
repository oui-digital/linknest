import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison of two secrets. Both sides are hashed first so the
 * comparison runs over equal-length buffers and the length of the real secret
 * never leaks through timing. Empty values never match.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Whether a request carries `Authorization: Bearer <ADMIN_API_SECRET>`.
 *
 * Fails closed: with ADMIN_API_SECRET unset every request is refused, the same
 * way the cron route treats CRON_SECRET. /api is excluded from middleware, so
 * this check is the only thing protecting the admin routes.
 */
export function isAdminRequest(
  request: Request,
  secret: string | undefined = process.env.ADMIN_API_SECRET,
): boolean {
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  return match ? secretsMatch(match[1], secret) : false;
}
