import { and, eq, isNotNull, ne, or, sql, exists } from "drizzle-orm";
import { accounts, users } from "@/lib/db/schema";
import type { DbOrTx, Tx, Db } from "@/lib/db/types";
import { canonicalizeEmail, getEmailDomain } from "@/lib/email-normalize";
import { isDisposableEmailDomain } from "@/lib/disposable-email";
import { abuseKeyForIp } from "@/lib/ip";
import { checkRateLimit, signupIpRateLimit } from "@/lib/rate-limit";
import { consumeVerificationToken } from "@/lib/tokens";

/**
 * New-account admission and the one-account-per-mailbox rule.
 *
 * An ESTABLISHED identity is a users row that has proven control of its
 * address: email_verified is set, or it has a linked OAuth account (Auth.js
 * creates OAuth users with email_verified NULL and links the account right
 * after). Unverified password or magic-link rows are not established — anyone
 * can create one for any address.
 *
 * The rule: a row may not BECOME established while another established row
 * has the same canonical address (src/lib/email-normalize.ts). It is enforced
 * atomically at every activation point by claimCanonicalIdentity(), under a
 * transaction-scoped advisory lock on the canonical address, so two aliases
 * activating concurrently serialize and the second one fails. Checking only
 * at signup-request time is not enough: several unverified aliases could be
 * registered first and verified afterwards.
 *
 * Only the activating row is checked against others. Rows that collided
 * before this rule existed are left alone, and `users.email` — the login
 * identity — is never rewritten here.
 */

export class IdentityConflictError extends Error {
  constructor() {
    super("An established account already uses this mailbox.");
    this.name = "IdentityConflictError";
  }
}

/** SQL predicate: the users row is established. */
const isEstablishedSql = or(
  isNotNull(users.emailVerified),
  exists(sql`(SELECT 1 FROM ${accounts} WHERE ${accounts.userId} = ${users.id})`),
);

export async function hasEstablishedDuplicate(
  db: DbOrTx,
  canonical: string,
  excludeUserId?: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.emailCanonical, canonical),
        excludeUserId ? ne(users.id, excludeUserId) : undefined,
        isEstablishedSql,
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function isEstablished(db: DbOrTx, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), isEstablishedSql))
    .limit(1);
  return Boolean(row);
}

/** Serialize every activation of one canonical address. */
export async function lockCanonical(tx: Tx, canonical: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`email_canonical:${canonical}`}))`);
}

/** Throws IdentityConflictError when another established row owns the mailbox. */
export async function claimCanonicalIdentity(
  tx: Tx,
  { canonical, excludeUserId }: { canonical: string; excludeUserId?: string },
): Promise<void> {
  await lockCanonical(tx, canonical);
  if (await hasEstablishedDuplicate(tx, canonical, excludeUserId)) {
    throw new IdentityConflictError();
  }
}

export type AdmissionRefusal = "rate_limited" | "disposable_domain" | "duplicate_identity";
export type AdmissionVerdict = { ok: true } | { ok: false; reason: AdmissionRefusal };

export type AdmissionDeps = {
  /** Consumes one signup from this network's allowance. */
  allowSignupFrom?: (abuseKey: string) => Promise<boolean>;
  isDisposable?: (domain: string) => Promise<boolean>;
};

const defaultAllowSignupFrom = async (abuseKey: string) =>
  (await checkRateLimit(signupIpRateLimit, abuseKey)).success;

/**
 * Admission checks for an address that has NO account yet. Callers look the
 * exact address up first and skip this for existing users, so someone who
 * signed up with a now-disposable domain, or from a busy network, can still
 * sign in.
 *
 * Friendly and non-atomic: it gives a good error early. The atomic guarantee
 * is claimCanonicalIdentity() at activation time.
 */
export async function admitNewAccount(
  db: DbOrTx,
  { email, ip }: { email: string; ip: string },
  { allowSignupFrom = defaultAllowSignupFrom, isDisposable = isDisposableEmailDomain }: AdmissionDeps = {},
): Promise<AdmissionVerdict> {
  if (!(await allowSignupFrom(abuseKeyForIp(ip)))) return { ok: false, reason: "rate_limited" };
  if (await isDisposable(getEmailDomain(email))) return { ok: false, reason: "disposable_domain" };
  if (await hasEstablishedDuplicate(db, canonicalizeEmail(email))) {
    return { ok: false, reason: "duplicate_identity" };
  }
  return { ok: true };
}

/**
 * Admission for a Google (type "oidc") or GitHub (type "oauth") sign-in,
 * checked in callbacks.signIn BEFORE Auth.js creates the user. Returning
 * users (a linked account, or any row with this exact address) pass; only a
 * would-be new account is checked.
 */
export async function admitOAuthSignIn(
  db: DbOrTx,
  {
    provider,
    providerAccountId,
    email,
    ip,
  }: { provider: string; providerAccountId: string; email: string | null | undefined; ip: string },
  deps: AdmissionDeps = {},
): Promise<AdmissionVerdict> {
  const [linked] = await db
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(and(eq(accounts.provider, provider), eq(accounts.providerAccountId, providerAccountId)))
    .limit(1);
  if (linked || !email) return { ok: true };

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  if (existing) return { ok: true };

  return admitNewAccount(db, { email, ip }, deps);
}

/**
 * The callbacks.signIn decision for OAuth: null to let the sign-in continue,
 * or the login URL to send a refused new account to. Google's provider is
 * type "oidc" and GitHub's is "oauth"; both are checked. Email and
 * credentials sign-ins are admitted elsewhere and pass straight through.
 */
export async function oauthSignupRedirect(
  db: DbOrTx,
  {
    email,
    account,
    ip,
  }: {
    email: string | null | undefined;
    account: { type: string; provider: string; providerAccountId: string } | null | undefined;
    ip: string;
  },
  deps: AdmissionDeps = {},
): Promise<string | null> {
  if (!account || (account.type !== "oauth" && account.type !== "oidc")) return null;
  const verdict = await admitOAuthSignIn(
    db,
    { provider: account.provider, providerAccountId: account.providerAccountId, email, ip },
    deps,
  );
  return verdict.ok ? null : `/login?error=signup_blocked&reason=${verdict.reason}`;
}

export type ActivationResult = "ok" | "invalid_token" | "not_found" | "conflict";

export type ActivationHooks = {
  /** Test-only: runs before the user row is locked. */
  beforeLock?: () => Promise<void>;
};

/**
 * Complete a password signup from its verify-email link: spend the token and
 * mark the address verified, unless another established account already owns
 * the mailbox.
 *
 * Everything happens in one transaction under the user row lock.
 * Registration replaces pending credentials, and the token issued with them,
 * under the same lock, so the token spent here always belongs to the
 * password being activated: a registration that commits first has already
 * deleted this token, and one that commits later finds the row verified and
 * backs off. Checking the token before taking the lock left a window in which
 * a registration could swap the password under an already-checked link.
 */
export async function activateVerifiedEmail(
  db: Db,
  { email, token }: { email: string; token: string },
  hooks?: ActivationHooks,
): Promise<ActivationResult> {
  const address = email.trim().toLowerCase();
  await hooks?.beforeLock?.();

  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        emailCanonical: users.emailCanonical,
      })
      .from(users)
      .where(eq(users.email, address))
      .for("update");

    if (!(await consumeVerificationToken(tx, address, token))) return "invalid_token";
    if (!user) return "not_found";

    const canonical = user.emailCanonical ?? canonicalizeEmail(user.email);
    if (!(await isEstablished(tx, user.id))) {
      try {
        await claimCanonicalIdentity(tx, { canonical, excludeUserId: user.id });
      } catch (error) {
        if (error instanceof IdentityConflictError) return "conflict";
        throw error;
      }
    }

    await tx
      .update(users)
      .set({
        emailVerified: user.emailVerified ?? new Date(),
        emailCanonical: canonical,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    return "ok";
  });
}
