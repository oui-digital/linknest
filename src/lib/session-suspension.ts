/**
 * Periodic suspension re-check for JWT sessions.
 *
 * Sessions are JWTs, so there is no session row to delete on suspension; the
 * jwt callback re-checks the account instead, and returning null clears the
 * cookie.
 *
 * The check is skipped on the edge runtime. Middleware runs there, and the
 * database driver cannot connect from it: the query threw, Auth.js reported a
 * JWTSessionError, and the editor's next save was redirected to /login. Every
 * page, server action and route handler calls auth() on the Node runtime, so
 * a suspended account is still cut off within SUSPENSION_RECHECK_MS.
 *
 * A failed lookup keeps the session and leaves the timestamp alone, so the
 * next request retries. Signing everyone out during a database blip would not
 * protect anything: the request that follows needs the database anyway.
 */

export const SUSPENSION_RECHECK_MS = 5 * 60 * 1000;

export async function recheckSuspension<T extends Record<string, unknown>>(
  token: T,
  {
    isSuspended,
    now = Date.now(),
    runtime = process.env.NEXT_RUNTIME,
  }: {
    isSuspended: (userId: string) => Promise<boolean>;
    now?: number;
    runtime?: string;
  },
): Promise<T | null> {
  if (runtime === "edge" || typeof token.id !== "string") return token;

  const checkedAt =
    typeof token.suspensionCheckedAt === "number" ? token.suspensionCheckedAt : 0;
  if (now - checkedAt <= SUSPENSION_RECHECK_MS) return token;

  let suspended: boolean;
  try {
    suspended = await isSuspended(token.id);
  } catch (error) {
    console.error("[auth] Suspension check failed; keeping the session:", error);
    return token;
  }
  if (suspended) return null;
  return { ...token, suspensionCheckedAt: now };
}
