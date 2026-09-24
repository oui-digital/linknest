import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";

const control = vi.hoisted(() => ({
  afterLookup: undefined as (() => Promise<void>) | undefined,
  beforeActivationLock: undefined as (() => Promise<void>) | undefined,
  closeDb: undefined as (() => Promise<void>) | undefined,
}));

// Exercise the real registration action and adapter against disposable
// Postgres. Only request context, email delivery and the scheduling point
// inside password hashing are controlled; authentication data is not mocked.
vi.mock("@/lib/db", async () => {
  const { createTestDb, warmPool } = await import("./helpers");
  const { db, pool } = createTestDb();
  await warmPool(pool);
  control.closeDb = () => pool.end();
  return { db };
});
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "198.51.100.10" }),
}));
vi.mock("@/lib/auth", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendExistingAccountNotice: vi.fn(),
  sendVerificationEmail: vi.fn(),
}));
// The verify route passes no hooks; inject the test-only one that runs just
// before activation takes the user row lock. Everything else is the real code.
vi.mock("@/lib/signup-admission", async () => {
  const actual = await vi.importActual<typeof import("@/lib/signup-admission")>(
    "@/lib/signup-admission",
  );
  return {
    ...actual,
    activateVerifiedEmail: (...[db, input]: Parameters<typeof actual.activateVerifiedEmail>) =>
      actual.activateVerifiedEmail(db, input, {
        beforeLock: async () => control.beforeActivationLock?.(),
      }),
  };
});
vi.mock("bcryptjs", async () => {
  const actual = await vi.importActual<typeof import("bcryptjs")>("bcryptjs");
  return {
    ...actual,
    default: {
      ...actual.default,
      hash: async (password: string, rounds: number) => {
        await control.afterLookup?.();
        return actual.default.hash(password, rounds);
      },
    },
  };
});

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { registerWithPassword } from "@/lib/actions/auth";
import { createAuthAdapter } from "@/lib/auth-adapter";
import { generateVerificationToken } from "@/lib/tokens";
import { GET as verifyEmail } from "@/app/api/auth/verify-email/route";
import { seedUser, truncateAll } from "./helpers";

beforeEach(async () => {
  control.afterLookup = undefined;
  control.beforeActivationLock = undefined;
  await truncateAll(db);
});
afterAll(async () => { await control.closeDb?.(); });

it("registration cannot install a password after a concurrent magic-link activation", async () => {
  const user = await seedUser(db, {
    email: "qa-owner@example.test",
    emailCanonical: "qa-owner@example.test",
    password: "unverified-placeholder",
  });
  const adapter = createAuthAdapter(db);

  // Registration has already observed emailVerified=null when hashing starts.
  // The actual mailbox owner activates via magic link before registration saves.
  control.afterLookup = async () => {
    await adapter.updateUser({ id: user.id, emailVerified: new Date() });
  };

  const form = new FormData();
  form.set("email", user.email);
  form.set("name", "QA pending registration");
  form.set("password", "qa-stranger-chosen-password");
  await registerWithPassword({}, form);

  const [saved] = await db.select().from(users).where(eq(users.id, user.id));
  expect(saved.emailVerified).not.toBeNull();
  const strangerPasswordWorks = saved.password
    ? await bcrypt.compare("qa-stranger-chosen-password", saved.password)
    : false;
  expect(strangerPasswordWorks).toBe(false);
});

it("a validated verification link cannot activate credentials replaced before activation", async () => {
  const user = await seedUser(db, {
    email: "qa-verification-owner@example.test",
    emailCanonical: "qa-verification-owner@example.test",
    password: await bcrypt.hash("qa-owner-original-password", 12),
  });
  const originalToken = await generateVerificationToken(user.email);

  // The owner has clicked their real link. A registration commits a
  // replacement password/token before the route acquires its user lock to
  // mark the account verified. Neither validation nor writes are mocked.
  control.beforeActivationLock = async () => {
    const form = new FormData();
    form.set("email", user.email);
    form.set("name", "QA concurrent registration");
    form.set("password", "qa-unverified-replacement-password");
    await registerWithPassword({}, form);
  };

  const query = new URLSearchParams({ email: user.email, token: originalToken.token });
  const res = await verifyEmail(new NextRequest(`http://localhost/api/auth/verify-email?${query}`));

  // The registration spent the owner's token, so the old link activates nothing.
  expect(res.headers.get("location")).toContain("error=expired-token");

  const [saved] = await db.select().from(users).where(eq(users.id, user.id));
  const replacementActivated = Boolean(saved.emailVerified && saved.password)
    && await bcrypt.compare("qa-unverified-replacement-password", saved.password!);
  expect(replacementActivated).toBe(false);
});
