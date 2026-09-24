import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { AdapterAccount } from "next-auth/adapters";
import { accounts, users } from "@/lib/db/schema";
import { createAuthAdapter } from "@/lib/auth-adapter";
import {
  IdentityConflictError,
  activateVerifiedEmail,
  oauthSignupRedirect,
  type AdmissionDeps,
} from "@/lib/signup-admission";
import { canonicalizeEmail } from "@/lib/email-normalize";
import { createTestDb, seedUser, truncateAll, warmPool } from "./helpers";

const { db, pool } = createTestDb();
const adapter = createAuthAdapter(db);
beforeAll(() => warmPool(pool));
beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

const IP = "198.51.100.20";
const allowAll: AdmissionDeps = {
  allowSignupFrom: async () => true,
  isDisposable: async (domain) => domain === "mailinator.com",
};
const google = (id: string) => ({ type: "oidc", provider: "google", providerAccountId: id });
const github = (id: string) => ({ type: "oauth", provider: "github", providerAccountId: id });

function oauthAccount(userId: string, provider = "google", id = `${provider}-${userId}`): AdapterAccount {
  return { userId, type: provider === "google" ? "oidc" : "oauth", provider, providerAccountId: id } as AdapterAccount;
}

async function established(email: string, { via = "verified" as "verified" | "account" } = {}) {
  const user = await seedUser(db, {
    email,
    emailCanonical: canonicalizeEmail(email),
    emailVerified: via === "verified" ? new Date() : null,
  });
  if (via === "account") {
    await db.insert(accounts).values({ userId: user.id, type: "oauth", provider: "github", providerAccountId: `gh-${user.id}` });
  }
  return user;
}

async function usersWithCanonical(canonical: string) {
  return db.select().from(users).where(eq(users.emailCanonical, canonical));
}

describe("OAuth admission before account creation", () => {
  for (const [name, account] of [
    ["Google (oidc)", google("g-1")],
    ["GitHub (oauth)", github("h-1")],
  ] as const) {
    it(`${name}: refuses a new account on a disposable domain`, async () => {
      expect(await oauthSignupRedirect(db, { email: "x@mailinator.com", account, ip: IP }, allowAll)).toBe(
        "/login?error=signup_blocked&reason=disposable_domain",
      );
    });

    it(`${name}: refuses a new account when an established account owns the mailbox`, async () => {
      await established("someone@gmail.com");
      expect(await oauthSignupRedirect(db, { email: "some.one+x@gmail.com", account, ip: IP }, allowAll)).toBe(
        "/login?error=signup_blocked&reason=duplicate_identity",
      );
    });

    it(`${name}: refuses when the network is over its signup allowance`, async () => {
      const deps = { ...allowAll, allowSignupFrom: async () => false };
      expect(await oauthSignupRedirect(db, { email: "new@example.test", account, ip: IP }, deps)).toBe(
        "/login?error=signup_blocked&reason=rate_limited",
      );
    });

    it(`${name}: lets returning users through, even on a disposable domain`, async () => {
      const user = await seedUser(db, { email: "old@mailinator.com" });
      await db.insert(accounts).values({ userId: user.id, ...account });
      expect(await oauthSignupRedirect(db, { email: "old@mailinator.com", account, ip: IP }, allowAll)).toBeNull();
    });
  }

  it("treats a linked account (not only a verified email) as established", async () => {
    await established("someone@gmail.com", { via: "account" });
    expect(
      await oauthSignupRedirect(db, { email: "some.one@gmail.com", account: google("g-2"), ip: IP }, allowAll),
    ).toBe("/login?error=signup_blocked&reason=duplicate_identity");
  });

  it("does not treat an unverified, unlinked row as established", async () => {
    await seedUser(db, { email: "someone@gmail.com", emailCanonical: "someone@gmail.com" });
    expect(
      await oauthSignupRedirect(db, { email: "some.one@gmail.com", account: google("g-3"), ip: IP }, allowAll),
    ).toBeNull();
  });

  it("an existing user with the exact address is not a new account", async () => {
    await seedUser(db, { email: "known@mailinator.com" });
    expect(
      await oauthSignupRedirect(db, { email: "known@mailinator.com", account: github("h-9"), ip: IP }, allowAll),
    ).toBeNull();
  });

  it("leaves email and credentials sign-ins to their own checks", async () => {
    for (const type of ["email", "credentials"]) {
      const account = { type, provider: type, providerAccountId: "x" };
      expect(await oauthSignupRedirect(db, { email: "x@mailinator.com", account, ip: IP }, allowAll)).toBeNull();
    }
  });
});

describe("magic-link account creation (adapter.createUser)", () => {
  it("lets exactly one of two concurrent aliases become an account", async () => {
    const results = await Promise.allSettled(
      ["some.one@gmail.com", "someone+x@gmail.com"].map((email) =>
        adapter.createUser({ id: "", email, emailVerified: new Date() }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(IdentityConflictError);
    expect(await usersWithCanonical("someone@gmail.com")).toHaveLength(1);
  });

  it("stores the address as given and the canonical form separately", async () => {
    const user = await adapter.createUser({ id: "", email: "first.last+tag@gmail.com", emailVerified: new Date() });
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.email).toBe("first.last+tag@gmail.com");
    expect(row.emailCanonical).toBe("firstlast@gmail.com");
  });
});

describe("OAuth account creation (createUser then linkAccount)", () => {
  it("lets exactly one of two concurrent aliases link, and removes the orphan", async () => {
    // Both creates pass: an unverified, unlinked row is not established yet.
    const a = await adapter.createUser({ id: "", email: "some.one@gmail.com", emailVerified: null });
    const b = await adapter.createUser({ id: "", email: "someone+x@gmail.com", emailVerified: null });

    const results = await Promise.allSettled([
      adapter.linkAccount(oauthAccount(a.id, "google", "g-a")),
      adapter.linkAccount(oauthAccount(b.id, "github", "h-b")),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(
      IdentityConflictError,
    );

    expect(await db.select().from(accounts)).toHaveLength(1);
    const remaining = await usersWithCanonical("someone@gmail.com");
    expect(remaining).toHaveLength(1);
    const [linked] = await db.select().from(accounts);
    expect(remaining[0].id).toBe(linked.userId);
  });

  it("never deletes an older or password-bearing user on conflict", async () => {
    await established("someone@gmail.com");
    const old = await seedUser(db, { email: "some.one@gmail.com", emailCanonical: "someone@gmail.com" });
    await db.execute(sql`UPDATE users SET created_at = now() - interval '2 days' WHERE id = ${old.id}`);
    const withPassword = await seedUser(db, {
      email: "someone+p@gmail.com",
      emailCanonical: "someone@gmail.com",
      password: "hash",
    });

    await expect(adapter.linkAccount(oauthAccount(old.id))).rejects.toBeInstanceOf(IdentityConflictError);
    await expect(adapter.linkAccount(oauthAccount(withPassword.id, "github"))).rejects.toBeInstanceOf(
      IdentityConflictError,
    );
    expect(await usersWithCanonical("someone@gmail.com")).toHaveLength(3);
    expect(await db.select().from(accounts)).toHaveLength(0);
  });

  it("adding a provider to an established account ignores pre-existing collisions", async () => {
    const first = await established("someone@gmail.com");
    await established("some.one@gmail.com"); // collided before the rule existed
    await expect(adapter.linkAccount(oauthAccount(first.id, "github", "h-first"))).resolves.toBeUndefined();
  });
});

describe("activation of an existing unverified row", () => {
  it("magic-link activation (updateUser) is refused for a second alias", async () => {
    await established("someone@gmail.com");
    const alias = await seedUser(db, { email: "some.one@gmail.com", password: "stranger-chosen" });

    await expect(adapter.updateUser({ id: alias.id, emailVerified: new Date() })).rejects.toBeInstanceOf(
      IdentityConflictError,
    );
    const [row] = await db.select().from(users).where(eq(users.id, alias.id));
    expect(row.emailVerified).toBeNull();
  });

  it("magic-link activation still discards a password nobody verified", async () => {
    const user = await seedUser(db, { email: "fresh@example.test", password: "stranger-chosen" });
    const updated = await adapter.updateUser({ id: user.id, emailVerified: new Date() });
    const [row] = await db.select().from(users).where(eq(users.id, updated.id));
    expect(row.password).toBeNull();
    expect(row.emailVerified).toBeTruthy();
    expect(row.emailCanonical).toBe("fresh@example.test");
  });

  it("ordinary profile updates on collided established rows are untouched", async () => {
    const a = await established("someone@gmail.com");
    await established("some.one@gmail.com");
    await expect(adapter.updateUser({ id: a.id, name: "Renamed" })).resolves.toMatchObject({ name: "Renamed" });
  });

  it("password verification lets exactly one of two concurrent aliases through", async () => {
    await seedUser(db, { email: "some.one@gmail.com", password: "h1" });
    await seedUser(db, { email: "someone+x@gmail.com", password: "h2" });
    const results = await Promise.all([
      activateVerifiedEmail(db, "some.one@gmail.com"),
      activateVerifiedEmail(db, "someone+x@gmail.com"),
    ]);
    expect(results.sort()).toEqual(["conflict", "ok"]);
  });

  it("re-verifying an established account is not a conflict", async () => {
    await established("someone@gmail.com");
    await established("some.one@gmail.com");
    expect(await activateVerifiedEmail(db, "some.one@gmail.com")).toBe("ok");
    expect(await activateVerifiedEmail(db, "nobody@example.test")).toBe("not_found");
  });
});

describe("existing-account login", () => {
  it("looks users up by the exact stored address, whatever the canonical value", async () => {
    const user = await seedUser(db, { email: "some.one+tag@gmail.com", emailCanonical: "someone@gmail.com" });
    expect((await adapter.getUserByEmail("some.one+tag@gmail.com"))?.id).toBe(user.id);
    expect(await adapter.getUserByEmail("someone@gmail.com")).toBeNull();
  });
});
