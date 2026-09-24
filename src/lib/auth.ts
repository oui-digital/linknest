import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { eq, and, isNull, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sendMagicLinkEmail } from "@/lib/email";
import { createAuthAdapter } from "@/lib/auth-adapter";
import { oauthSignupRedirect } from "@/lib/signup-admission";
import { getClientIp } from "@/lib/request-ip";

// Direct Drizzle queries, plus the one-account-per-mailbox checks at every
// point where an account is created or activated (src/lib/auth-adapter.ts).
const adapter = createAuthAdapter(db);

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
  events: {
    // Signup attribution for magic-link and OAuth accounts (password signups
    // record it at insert). Attribution only — admission happened before the
    // user was created — so a failure here is logged and never blocks
    // sign-in. For magic links the IP is the one that clicked the link.
    async signIn({ user, account, isNewUser }) {
      if (!isNewUser || !user.id) return;
      try {
        const provider = account?.provider;
        await db
          .update(users)
          .set({
            signupMethod: provider === "email" ? "magic_link" : (provider ?? null),
            signupIp: await getClientIp(),
            signupUserAgent: (await headers()).get("user-agent")?.slice(0, 512) ?? null,
          })
          .where(and(eq(users.id, user.id), isNull(users.signupMethod)));
      } catch (error) {
        console.error("[auth] Failed to record signup attribution:", error);
      }
    },
  },
  pages: {
    signIn: "/login",
    newUser: "/onboarding",
    verifyRequest: "/check-email",
    error: "/login",
  },
  callbacks: {
    // Runs for every provider, including before a magic link is emailed, so a
    // suspended user can't start a new session by any route.
    //
    // It also runs BEFORE Auth.js creates a user, which makes it the place to
    // apply new-account admission to Google (type "oidc") and GitHub (type
    // "oauth") signups: disposable domain, per-network signup limit, and an
    // established account already owning the mailbox. Returning users pass.
    // Magic-link and password signups are admitted in src/lib/actions/auth.ts.
    async signIn({ user, account }) {
      if (user.email && (await isSuspended(eq(users.email, user.email.toLowerCase())))) {
        return false;
      }
      const refused = await oauthSignupRedirect(db, {
        email: user.email,
        account,
        ip: await getClientIp(),
      });
      return refused ?? true;
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
