import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { eq, and, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "@/lib/db/schema";
import { sendMagicLinkEmail } from "@/lib/email";

// DrizzleAdapter's internal queries fail on Vercel with opaque NeonDbError.
// Override critical methods with direct Drizzle queries that work reliably.
const baseAdapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
});

const adapter = {
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
   * Account-takeover guard.
   *
   * registerWithPassword creates a users row for ANY email with no proof of
   * ownership (emailVerified = null). If the real owner of that mailbox later
   * signs in with a magic link or OAuth, @auth/core activates that same row by
   * setting emailVerified — which silently arms the password a stranger chose,
   * because the Credentials provider's only gate is emailVerified.
   *
   * So: whenever a sign-in activates a previously unverified account, discard
   * any password on it. A password that was already verified survives, since
   * such a row has emailVerified set and never enters this branch.
   */
  async updateUser(data: { id: string; emailVerified?: Date | null }) {
    if (data.emailVerified) {
      const [current] = await db
        .select({
          emailVerified: users.emailVerified,
          password: users.password,
        })
        .from(users)
        .where(eq(users.id, data.id))
        .limit(1);

      if (current && !current.emailVerified && current.password) {
        await db
          .update(users)
          .set({ password: null })
          .where(eq(users.id, data.id));
      }
    }

    return baseAdapter.updateUser!(data as Parameters<
      NonNullable<typeof baseAdapter.updateUser>
    >[0]);
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

const SUSPENSION_RECHECK_MS = 5 * 60 * 1000;

async function isSuspended(where: SQL): Promise<boolean> {
  const [row] = await db
    .select({ suspendedAt: users.suspendedAt })
    .from(users)
    .where(where)
    .limit(1);
  return Boolean(row?.suspendedAt);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  session: {
    strategy: "jwt",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    {
      id: "email",
      name: "Email",
      type: "email",
      from: process.env.EMAIL_FROM || "LinkNest <noreply@linknest.click>",
      maxAge: 24 * 60 * 60,
      sendVerificationRequest: async ({ identifier: email, url }) => {
        await sendMagicLinkEmail({ to: email, url });
      },
      options: {},
    },
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = (credentials.email as string).toLowerCase().trim();
        const password = credentials.password as string;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return null;

        // Only allow login if email is verified
        if (!user.emailVerified) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
    newUser: "/onboarding",
    verifyRequest: "/check-email",
    error: "/login",
  },
  callbacks: {
    // Runs for every provider, including before a magic link is emailed, so a
    // suspended user can't start a new session by any route.
    async signIn({ user }) {
      if (!user.email) return true;
      return !(await isSuspended(eq(users.email, user.email.toLowerCase())));
    },
    // Sessions are JWTs, so there is no session row to delete on suspension.
    // Re-check the account periodically instead; returning null clears the
    // cookie. The timestamp only persists where Auth.js can write cookies
    // (middleware, route handlers) — elsewhere the check simply re-runs.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.suspensionCheckedAt = Date.now();
        return token;
      }

      const checkedAt = (token.suspensionCheckedAt as number | undefined) ?? 0;
      if (token.id && Date.now() - checkedAt > SUSPENSION_RECHECK_MS) {
        if (await isSuspended(eq(users.id, token.id as string))) return null;
        token.suspensionCheckedAt = Date.now();
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      return session;
    },
  },
});
