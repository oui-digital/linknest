"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { signIn } from "@/lib/auth";
import {
  checkRateLimit,
  authRateLimit,
  emailRateLimit,
  emailIpRateLimit,
} from "@/lib/rate-limit";
import { sendExistingAccountNotice, sendVerificationEmail } from "@/lib/email";
import { generateVerificationToken } from "@/lib/tokens";
import { getClientIp } from "@/lib/request-ip";
import { abuseKeyForIp } from "@/lib/ip";
import { canonicalizeEmail } from "@/lib/email-normalize";
import { TURNSTILE_FAILED_ERROR, verifyTurnstileToken } from "@/lib/turnstile";
import {
  IdentityConflictError,
  admitNewAccount,
  claimCanonicalIdentity,
  type AdmissionRefusal,
} from "@/lib/signup-admission";

// ─── Validation Schemas ─────────────────────────────────────────────────────

const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.string().email("Invalid email address").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const magicLinkSchema = z.object({
  email: z.string().email("Invalid email address"),
});

// ─── Types ──────────────────────────────────────────────────────────────────

export type AuthState = {
  error?: string;
  success?: string;
};

const TOO_MANY = "Too many attempts. Please try again later.";

/**
 * Messages for refused NEW accounts. A duplicate mailbox is deliberately not
 * listed: telling the requester "an account exists" would turn signup into an
 * oracle for which addresses have accounts, so that case answers with the
 * normal "check your email" message and emails the mailbox instead.
 */
const REFUSAL_MESSAGES: Record<Exclude<AdmissionRefusal, "duplicate_identity">, string> = {
  rate_limited: "Too many new accounts from your network. Please try again later.",
  disposable_domain: "Please use a permanent email address.",
};

/**
 * Tell the owner of a mailbox that already has an account, without telling
 * the requester anything. Throttled per canonical address like every other
 * auth email.
 */
async function noticeExistingAccount(email: string, canonical: string) {
  const rl = await checkRateLimit(emailRateLimit, `notice:${canonical}`);
  if (!rl.success) return;
  try {
    await sendExistingAccountNotice({ to: email });
  } catch (error) {
    console.error("[auth] Failed to send existing-account notice:", error);
  }
}

// ─── Register with Email + Password ─────────────────────────────────────────

export async function registerWithPassword(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { name, email, password } = parsed.data;
  // `normalizedEmail` is the login identity, stored as typed (lowercased).
  // `canonical` is only an abuse key: +tags and Gmail dots removed.
  const normalizedEmail = email.toLowerCase().trim();
  const canonical = canonicalizeEmail(normalizedEmail);
  const ip = await getClientIp();

  const captcha = await verifyTurnstileToken({
    token: formData.get("cf-turnstile-response"),
    remoteIp: ip,
    action: "register",
  });
  if (!captcha.ok) return { error: TURNSTILE_FAILED_ERROR };

  const [existingUser] = await db
    .select({ id: users.id, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  // Admission applies to new addresses only.
  let duplicateMailbox = false;
  if (!existingUser) {
    const verdict = await admitNewAccount(db, { email: normalizedEmail, ip });
    if (!verdict.ok) {
      if (verdict.reason !== "duplicate_identity") {
        return { error: REFUSAL_MESSAGES[verdict.reason] };
      }
      duplicateMailbox = true;
    }
  }

  // Rate limit by mailbox, so +tag variants share one bucket.
  const rl = await checkRateLimit(authRateLimit, `register:${canonical}`);
  if (!rl.success) {
    return { error: TOO_MANY };
  }

  // Hash password (cost factor 12). Computed before branching so that the
  // response time does not reveal whether the address is already registered.
  const hashedPassword = await bcrypt.hash(password, 12);

  const alreadyRegistered = {
    success:
      "Check your email to finish setting up your account. If you already have one, sign in instead.",
  };

  if (existingUser?.emailVerified) {
    // Deliberately the same generic response as the success path: returning
    // "this email already exists" here turns signup into an account oracle.
    return alreadyRegistered;
  }

  if (duplicateMailbox) {
    // Same reasoning: another spelling of this mailbox already has an
    // account. Answer generically and let the mailbox owner know.
    await noticeExistingAccount(normalizedEmail, canonical);
    return alreadyRegistered;
  }

  // The credentials and the token that verifies them are written together,
  // so the only live token always belongs to the attempt whose password is
  // stored. A later attempt deletes the earlier token in the same write.
  let token: string;
  if (existingUser) {
    // The row exists but was never verified, so nobody has proven ownership of
    // this mailbox yet. Let the latest attempt replace the pending credentials
    // — otherwise whoever submitted the form first permanently locks the real
    // owner out of password signup.
    //
    // The row was read before hashing, unlocked. Re-check it under the row
    // lock that activation (magic link, OAuth, verify link) also takes: if the
    // owner activated it meanwhile, the activation discarded any pending
    // password, and writing ours now would arm a password nobody verified.
    const issued = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ emailVerified: users.emailVerified })
        .from(users)
        .where(eq(users.id, existingUser.id))
        .for("update");
      if (!current || current.emailVerified) return null;

      await tx
        .update(users)
        .set({ name, password: hashedPassword, emailCanonical: canonical })
        .where(eq(users.id, existingUser.id));
      return generateVerificationToken(normalizedEmail, tx);
    });
    if (!issued) return alreadyRegistered;
    token = issued.token;
  } else {
    // Create user (emailVerified is null — must verify before login). The
    // canonical claim makes the duplicate check atomic with the insert; the
    // row only becomes established when verified, which claims again.
    try {
      const issued = await db.transaction(async (tx) => {
        await claimCanonicalIdentity(tx, { canonical });
        await tx.insert(users).values({
          name,
          email: normalizedEmail,
          password: hashedPassword,
          emailVerified: null,
          emailCanonical: canonical,
          signupMethod: "password",
          signupIp: ip,
          signupUserAgent: (await headers()).get("user-agent")?.slice(0, 512) ?? null,
        });
        return generateVerificationToken(normalizedEmail, tx);
      });
      token = issued.token;
    } catch (error) {
      if (!(error instanceof IdentityConflictError)) throw error;
      await noticeExistingAccount(normalizedEmail, canonical);
      return alreadyRegistered;
    }
  }

  // Send the verification email. Throttled sends leave the token unsent,
  // which is harmless: nobody else can know it.
  const emailRl = await checkRateLimit(emailRateLimit, `email:${canonical}`);
  const networkRl = await checkRateLimit(emailIpRateLimit, abuseKeyForIp(ip));
  if (!emailRl.success || !networkRl.success) {
    return { success: "Check your email to verify your account." };
  }

  try {
    await sendVerificationEmail({ to: normalizedEmail, token });
  } catch (error) {
    // The user row is already committed. Without this catch the action throws,
    // the account exists but is unverifiable, and re-registering is the only
    // recovery — so surface a retryable error instead of crashing.
    console.error("[register] Failed to send verification email:", error);
    return {
      error:
        "We couldn't send your verification email. Please try again in a moment.",
    };
  }

  return { success: "Check your email to verify your account." };
}

// ─── Login with Email + Password ────────────────────────────────────────────

export async function loginWithPassword(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // Keyed by mailbox: case changes, +tags and Gmail dots used to each get a
  // fresh bucket. The login itself still uses the exact address.
  const rl = await checkRateLimit(
    authRateLimit,
    `login:${canonicalizeEmail(parsed.data.email)}`,
  );
  if (!rl.success) {
    return { error: TOO_MANY };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    // signIn throws NEXT_REDIRECT on success — re-throw to let Next.js handle it
    if (
      error instanceof Error &&
      "digest" in error &&
      typeof (error as { digest: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    return { error: "Invalid email or password." };
  }

  return {}; // unreachable due to redirect
}

// ─── Send Magic Link ────────────────────────────────────────────────────────

export async function sendMagicLink(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = magicLinkSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const normalizedEmail = parsed.data.email.toLowerCase().trim();
  const canonical = canonicalizeEmail(normalizedEmail);
  const ip = await getClientIp();
  const checkEmail = { success: "Check your email for a sign-in link." };

  // A magic link for an unknown address creates an account when clicked, so
  // this form is a signup surface on the login page too.
  const captcha = await verifyTurnstileToken({
    token: formData.get("cf-turnstile-response"),
    remoteIp: ip,
    action: "magic_link",
  });
  if (!captcha.ok) return { error: TURNSTILE_FAILED_ERROR };

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!existingUser) {
    const verdict = await admitNewAccount(db, { email: normalizedEmail, ip });
    if (!verdict.ok) {
      if (verdict.reason !== "duplicate_identity") {
        return { error: REFUSAL_MESSAGES[verdict.reason] };
      }
      // Another spelling of this mailbox has an account. Answer as usual so
      // the form reveals nothing, and tell the mailbox owner instead.
      await noticeExistingAccount(normalizedEmail, canonical);
      return checkEmail;
    }
  }

  const rl = await checkRateLimit(emailRateLimit, `magic:${canonical}`);
  const networkRl = await checkRateLimit(emailIpRateLimit, abuseKeyForIp(ip));
  if (!rl.success || !networkRl.success) {
    return { error: TOO_MANY };
  }

  try {
    await signIn("email", {
      email: normalizedEmail,
      redirect: false,
    });
  } catch (error) {
    // signIn may throw NEXT_REDIRECT — re-throw
    if (
      error instanceof Error &&
      "digest" in error &&
      typeof (error as { digest: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    // Log the actual error for debugging (visible in server logs)
    console.error("[magic-link] Failed to send:", error);
    return { error: "Unable to send sign-in email. Please try again later." };
  }

  return checkEmail;
}
