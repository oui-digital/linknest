import crypto from "crypto";
import { db } from "@/lib/db";
import { verificationTokens } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/types";

/**
 * Issue a fresh verification token for `email`, invalidating earlier ones.
 * Pass a transaction to issue it atomically with the credentials it verifies.
 */
export async function generateVerificationToken(email: string, executor: DbOrTx = db) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Delete any existing tokens for this email
  await executor
    .delete(verificationTokens)
    .where(eq(verificationTokens.identifier, email));

  // Insert new token
  const [created] = await executor
    .insert(verificationTokens)
    .values({
      identifier: email,
      token,
      expires,
    })
    .returning();

  return created;
}

/**
 * Spend a verification token: delete it if it matches and has not expired,
 * and report whether it did. Run it in the transaction that acts on it, so
 * the check and the action cannot be separated.
 */
export async function consumeVerificationToken(
  executor: DbOrTx,
  email: string,
  token: string,
): Promise<boolean> {
  const consumed = await executor
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, email),
        eq(verificationTokens.token, token),
        gt(verificationTokens.expires, new Date()),
      ),
    )
    .returning({ token: verificationTokens.token });
  return consumed.length > 0;
}
