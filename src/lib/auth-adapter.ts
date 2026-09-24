import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { AdapterAccount, AdapterUser } from "next-auth/adapters";
import { and, eq, isNull, notExists, sql } from "drizzle-orm";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
  workspaceMembers,
} from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { canonicalizeEmail } from "@/lib/email-normalize";
import {
  IdentityConflictError,
  claimCanonicalIdentity,
  hasEstablishedDuplicate,
  isEstablished,
  lockCanonical,
} from "@/lib/signup-admission";

/**
 * How long createUser's record of an unlinked user it made is kept. Auth.js
 * calls linkAccount straight after createUser in the same request, so this
 * only bounds memory for attempts that never reach linkAccount.
 */
const CREATED_TTL_MS = 10 * 60 * 1000;

/**
 * The Auth.js adapter, built for a given database so the integration tests
 * can drive createUser/linkAccount on real concurrent connections.
 *
 * DrizzleAdapter's internal queries fail on Vercel with opaque NeonDbError, so
 * the critical methods are direct Drizzle queries. The account-creating and
 * account-activating methods also enforce one established account per mailbox
 * (src/lib/signup-admission.ts).
 */
export function createAuthAdapter(db: Db) {
  const baseAdapter = DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  });

  // Unverified users this adapter created and that are still waiting for
  // linkAccount: id -> creation time. This is the only proof linkAccount
  // accepts that a conflicting user is the rejected attempt's own orphan.
  // Age and emptiness are not proof: any unverified row can look like that.
  const createdUnlinked = new Map<string, number>();
  function forgetExpired(now: number) {
    for (const [id, at] of createdUnlinked) {
      if (now - at > CREATED_TTL_MS) createdUnlinked.delete(id);
    }
  }

  return {
    ...baseAdapter,

    async getUserByEmail(email: string) {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      return user ?? null;
    },

    /**
     * Magic-link users are created already verified, so this is where they
     * become established: claim the canonical address atomically. OAuth users
     * are created unverified and only become established in linkAccount,
     * which re-checks; the claim here just refuses early.
     *
     * `email` is stored as the provider or Auth.js gave it; only the abuse key
     * is canonicalized.
     */
    async createUser(data: AdapterUser): Promise<AdapterUser> {
      const canonical = canonicalizeEmail(data.email);
      const created = await db.transaction(async (tx) => {
        await claimCanonicalIdentity(tx, { canonical });
        const [user] = await tx
          .insert(users)
          .values({
            name: data.name ?? null,
            email: data.email,
            image: data.image ?? null,
            emailVerified: data.emailVerified ?? null,
            emailCanonical: canonical,
          })
          .returning();
        return user as AdapterUser;
      });
      if (!created.emailVerified) {
        const now = Date.now();
        forgetExpired(now);
        createdUnlinked.set(created.id, now);
      }
      return created;
    },

    /**
     * Linking a first OAuth account is what makes a new OAuth user
     * established. Auth.js calls createUser() and only then linkAccount(), so
     * the canonical lock taken in createUser is already released here: two
     * aliases signing up at once could both pass it. Re-check under the same
     * lock and insert the account in one transaction.
     *
     * On conflict the just-created user is deleted — but only when this
     * adapter's createUser made it for this attempt (and it still has nothing
     * attached). Any other conflicting row is left for separate cleanup,
     * however orphan-like it looks. The delete must commit, so the transaction
     * returns a conflict result and the error is thrown after it.
     */
    async linkAccount(account: AdapterAccount): Promise<void> {
      const createdHere = createdUnlinked.has(account.userId);
      createdUnlinked.delete(account.userId);

      const outcome = await db.transaction(async (tx) => {
        const [user] = await tx
          .select({ id: users.id, email: users.email, emailCanonical: users.emailCanonical })
          .from(users)
          .where(eq(users.id, account.userId))
          .for("update");
        if (!user) throw new Error("linkAccount: user not found");

        // Adding a provider to an account that is already established is not
        // an activation, and pre-existing collisions are left alone.
        if (!(await isEstablished(tx, user.id))) {
          const canonical = user.emailCanonical ?? canonicalizeEmail(user.email);
          await lockCanonical(tx, canonical);
          if (await hasEstablishedDuplicate(tx, canonical, user.id)) {
            if (!createdHere) return "conflict" as const;
            await tx
              .delete(users)
              .where(
                and(
                  eq(users.id, user.id),
                  isNull(users.emailVerified),
                  isNull(users.password),
                  notExists(
                    tx.select({ one: sql`1` }).from(accounts).where(eq(accounts.userId, user.id)),
                  ),
                  notExists(
                    tx
                      .select({ one: sql`1` })
                      .from(workspaceMembers)
                      .where(eq(workspaceMembers.userId, user.id)),
                  ),
                ),
              );
            return "conflict" as const;
          }
        }

        await tx.insert(accounts).values(account);
        return "linked" as const;
      });

      if (outcome === "conflict") throw new IdentityConflictError();
    },

    /**
     * Account-takeover guard.
     *
     * registerWithPassword creates a users row for ANY email with no proof of
     * ownership (emailVerified = null). If the real owner of that mailbox later
     * signs in with a magic link or OAuth, @auth/core activates that same row
     * by setting emailVerified — which silently arms the password a stranger
     * chose, because the Credentials provider's only gate is emailVerified.
     *
     * So: whenever a sign-in activates a previously unverified account,
     * discard any password on it. A password that was already verified
     * survives, since such a row has emailVerified set and never enters this
     * branch.
     *
     * Activation is also where an unverified row becomes established, so it
     * claims the canonical address (unless the row already has an account).
     */
    async updateUser(data: Partial<AdapterUser> & Pick<AdapterUser, "id">): Promise<AdapterUser> {
      const outcome = await db.transaction(async (tx) => {
        const [current] = await tx
          .select({
            email: users.email,
            emailVerified: users.emailVerified,
            emailCanonical: users.emailCanonical,
            password: users.password,
          })
          .from(users)
          .where(eq(users.id, data.id))
          .for("update");
        if (!current) throw new Error("updateUser: user not found");

        const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
        if (data.name !== undefined) patch.name = data.name;
        if (data.email !== undefined) patch.email = data.email;
        if (data.image !== undefined) patch.image = data.image;
        if (data.emailVerified !== undefined) patch.emailVerified = data.emailVerified;

        const activating = Boolean(data.emailVerified) && !current.emailVerified;
        if (activating) {
          const canonical = current.emailCanonical ?? canonicalizeEmail(current.email);
          if (!(await isEstablished(tx, data.id))) {
            await lockCanonical(tx, canonical);
            if (await hasEstablishedDuplicate(tx, canonical, data.id)) {
              return { conflict: true as const };
            }
          }
          patch.emailCanonical = canonical;
          if (current.password) patch.password = null;
        }

        const [updated] = await tx.update(users).set(patch).where(eq(users.id, data.id)).returning();
        return { conflict: false as const, user: updated as AdapterUser };
      });

      if (outcome.conflict) throw new IdentityConflictError();
      return outcome.user;
    },

    async createVerificationToken(data: {
      identifier: string;
      token: string;
      expires: Date;
    }) {
      const [created] = await db
        .insert(verificationTokens)
        .values(data)
        .returning();
      return created ?? null;
    },

    async useVerificationToken(data: { identifier: string; token: string }) {
      const [existing] = await db
        .select()
        .from(verificationTokens)
        .where(
          and(
            eq(verificationTokens.identifier, data.identifier),
            eq(verificationTokens.token, data.token),
          ),
        )
        .limit(1);
      if (!existing) return null;
      await db
        .delete(verificationTokens)
        .where(
          and(
            eq(verificationTokens.identifier, data.identifier),
            eq(verificationTokens.token, data.token),
          ),
        );
      return existing;
    },
  };
}
