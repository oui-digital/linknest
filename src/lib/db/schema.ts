import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  pgSequence,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── users (Auth.js-compatible) ──────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).unique().notNull(),
    name: varchar("name", { length: 255 }),
    image: text("image"), // Auth.js convention (profile picture URL)
    emailVerified: timestamp("email_verified", { mode: "date" }),
    password: text("password"), // bcrypt hash — null for OAuth-only / magic-link-only users
    suspendedAt: timestamp("suspended_at", { mode: "date" }), // set by an admin; blocks sign-in and drops live sessions
    // Abuse key, NOT an identity: `email` stays exactly what the user signed up
    // with and is what every login looks up. This is the address with plus
    // tags and Gmail dots removed (src/lib/email-normalize.ts), used to stop
    // one mailbox registering many accounts. Deliberately not unique:
    // pre-existing collisions are left alone.
    emailCanonical: varchar("email_canonical", { length: 255 }),
    // Signup attribution, so a spam ring is visible in one query.
    signupMethod: varchar("signup_method", { length: 20 }), // 'password' | 'magic_link' | 'google' | 'github'
    signupIp: varchar("signup_ip", { length: 45 }),
    signupUserAgent: varchar("signup_user_agent", { length: 512 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("users_email_canonical_idx").on(table.emailCanonical)],
);

// ─── accounts (Auth.js OAuth provider linking) ──────────────────────────────

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    type: varchar("type", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: varchar("token_type", { length: 255 }),
    scope: varchar("scope", { length: 255 }),
    id_token: text("id_token"),
    session_state: varchar("session_state", { length: 255 }),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
  ],
);

// ─── sessions (Auth.js — required by adapter) ──────────────────────────────

export const sessions = pgTable("sessions", {
  sessionToken: varchar("session_token", { length: 255 }).primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// ─── verification_tokens (Auth.js — required for magic link / email) ────────

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.identifier, table.token] }),
  ],
);

// ─── workspaces ──────────────────────────────────────────────────────────────

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 63 }).unique().notNull(),
  plan: varchar("plan", { length: 20 }).default("free").notNull(), // 'free' | 'pro' — DERIVED CACHE
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }).unique(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── workspace_members ───────────────────────────────────────────────────────

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: varchar("role", { length: 20 }).default("owner").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
  ],
);

// ─── pages ───────────────────────────────────────────────────────────────────

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    slug: varchar("slug", { length: 63 }).unique().notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    templateId: varchar("template_id", { length: 63 })
      .default("clean-slate")
      .notNull(),
    theme: jsonb("theme").default({}).notNull(),
    seoTitle: varchar("seo_title", { length: 70 }),
    seoDescription: varchar("seo_description", { length: 160 }),
    isPublished: boolean("is_published").default(false).notNull(),
    publishedAt: timestamp("published_at", { mode: "date" }), // reset on every publish
    // Set once, on the first publish, and never changed. The search-indexing
    // probation (src/lib/indexing.ts) counts from here: createdAt would let a
    // spammer age drafts before publishing, and publishedAt resets whenever a
    // legitimate owner republishes. Age is only a delay — live edits to an
    // indexed page are still scanned (see src/lib/live-edit.ts).
    firstPublishedAt: timestamp("first_published_at", { mode: "date" }),
    // Bumped by every block mutation that can change what a visitor sees.
    // publishPage scans links outside its transaction, then re-reads this under
    // the page row lock: if it moved, the scan is stale and publish retries.
    contentVersion: integer("content_version").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("pages_workspace_id_idx").on(table.workspaceId),
    index("pages_is_published_idx").on(table.isPublished),
  ],
);

// ─── blocks ──────────────────────────────────────────────────────────────────

export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .references(() => pages.id, { onDelete: "cascade" })
      .notNull(),
    type: varchar("type", { length: 30 }).notNull(), // 'link' | 'header' | 'text' | 'divider' | 'image'
    position: integer("position").notNull(),
    label: varchar("label", { length: 255 }),
    url: text("url"),
    content: jsonb("content").default({}),
    isVisible: boolean("is_visible").default(true).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("blocks_page_position_idx").on(table.pageId, table.position),
  ],
);

// ─── assets ──────────────────────────────────────────────────────────────────

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    filename: varchar("filename", { length: 255 }).notNull(),
    r2Key: text("r2_key").unique().notNull(),
    url: text("url").notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("assets_workspace_id_idx").on(table.workspaceId),
  ],
);

// ─── subscriptions (CANONICAL billing source of truth) ───────────────────────

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .unique()
      .notNull(),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 })
      .unique()
      .notNull(),
    stripePriceId: varchar("stripe_price_id", { length: 255 }).notNull(),
    status: varchar("status", { length: 30 }).notNull(), // 'active' | 'past_due' | 'canceled' | 'trialing'
    currentPeriodStart: timestamp("current_period_start", { mode: "date" }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", { mode: "date" }).notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    downgradedAt: timestamp("downgraded_at", { mode: "date" }), // set on pro→free; NULL on re-upgrade
    lastStripeEventCreated: timestamp("last_stripe_event_created", { mode: "date" }), // ordering guard
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("subscriptions_status_idx").on(table.status),
  ],
);

// ─── entitlement_overrides (manual exceptions only) ──────────────────────────

export const entitlementOverrides = pgTable(
  "entitlement_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    feature: varchar("feature", { length: 63 }).notNull(),
    value: jsonb("value").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("entitlement_overrides_ws_feature_idx").on(
      table.workspaceId,
      table.feature,
    ),
  ],
);

// ─── page_reports (abuse reports) ────────────────────────────────────────────

export const pageReports = pgTable(
  "page_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .references(() => pages.id, { onDelete: "cascade" })
      .notNull(),
    reporterIp: varchar("reporter_ip", { length: 45 }).notNull(),
    // Who counts as one reporter: abuseKeyForIp(reporter_ip), which collapses
    // an IPv6 /64 (src/lib/ip.ts). Nullable only until
    // scripts/backfill-reporter-key.ts has filled historical rows; every new
    // report writes it. Making it NOT NULL is a separate, later deploy — a
    // push that adds the constraint while NULLs exist would truncate.
    reporterKey: varchar("reporter_key", { length: 64 }),
    // The page's review epoch when this report was filed: the seq of its
    // latest reinstatement, or 0. Assigned under the page row lock, so a
    // report that raced a reinstatement lands in the new epoch. Reports are
    // deduplicated and counted per epoch; timestamps only bound the 24h window.
    reviewEpoch: bigint("review_epoch", { mode: "number" }).default(0).notNull(),
    reason: varchar("reason", { length: 30 }).notNull(), // 'phishing' | 'malware' | 'spam' | 'other'
    details: text("details"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("page_reports_page_id_idx").on(table.pageId),
    index("page_reports_created_at_idx").on(table.createdAt),
    index("page_reports_page_epoch_idx").on(table.pageId, table.reviewEpoch, table.reporterKey),
  ],
);

// ─── pending_url_scans (fail-open safety net) ────────────────────────────────

export const pendingUrlScans = pgTable(
  "pending_url_scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .references(() => pages.id, { onDelete: "cascade" })
      .notNull(),
    url: text("url").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    scannedAt: timestamp("scanned_at", { mode: "date" }),
    isSafe: boolean("is_safe"),
  },
  (table) => [
    index("pending_url_scans_pending_idx").on(table.scannedAt),
  ],
);

// ─── page_moderation_log (audit trail for takedowns) ─────────────────────────

export const pageModerationLogSeq = pgSequence("page_moderation_log_seq");

export const pageModerationLog = pgTable(
  "page_moderation_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Total order of moderation events. Holds are folded in this order
    // (src/lib/moderation.ts), not by created_at: now() is the transaction's
    // start time, so two events serialized by the page lock can carry
    // timestamps in the opposite order to the one they committed in.
    //
    // A column defaulting to a named sequence, not bigserial/identity: for
    // those, `drizzle-kit push` sees "NOT NULL without a default" and
    // TRUNCATES this table — the audit trail and the takedown state. With an
    // explicit default Postgres fills existing rows instead, and the backfill
    // in scripts/backfills/02 renumbers them into event order.
    seq: bigint("seq", { mode: "number" })
      .notNull()
      .default(sql`nextval('page_moderation_log_seq'::regclass)`),
    pageId: uuid("page_id")
      .references(() => pages.id, { onDelete: "cascade" })
      .notNull(),
    action: varchar("action", { length: 30 }).notNull(), // 'unpublished' | 'warning' | 'reinstated'
    // For 'unpublished' by a blocking source this names the hold; a
    // 'reinstated' row clears the hold with the same code, or all with 'all'.
    reasonCode: varchar("reason_code", { length: 30 }).notNull(), // 'safe_browsing_flagged' | 'manual_review' | etc.
    source: varchar("source", { length: 30 }).notNull(), // 'cron_rescan' | 'publish_block' | 'admin_manual' | etc.
    details: text("details"),
    rawApiResponse: jsonb("raw_api_response"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("page_moderation_log_page_id_idx").on(table.pageId),
    index("page_moderation_log_created_at_idx").on(table.createdAt),
    index("page_moderation_log_page_seq_idx").on(table.pageId, table.seq),
  ],
);

// ─── stripe_processed_events (webhook deduplication) ─────────────────────────

export const stripeProcessedEvents = pgTable("stripe_processed_events", {
  eventId: varchar("event_id", { length: 255 }).primaryKey(),
  processedAt: timestamp("processed_at", { mode: "date" }).defaultNow().notNull(),
});
