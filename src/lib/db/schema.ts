import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ─── users (Auth.js-compatible) ──────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  name: varchar("name", { length: 255 }),
  image: text("image"), // Auth.js convention (profile picture URL)
  emailVerified: timestamp("email_verified", { mode: "date" }),
  password: text("password"), // bcrypt hash — null for OAuth-only / magic-link-only users
  suspendedAt: timestamp("suspended_at", { mode: "date" }), // set by an admin; blocks sign-in and drops live sessions
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

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
    publishedAt: timestamp("published_at", { mode: "date" }),
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
    reason: varchar("reason", { length: 30 }).notNull(), // 'phishing' | 'malware' | 'spam' | 'other'
    details: text("details"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("page_reports_page_id_idx").on(table.pageId),
    index("page_reports_created_at_idx").on(table.createdAt),
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

export const pageModerationLog = pgTable(
  "page_moderation_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .references(() => pages.id, { onDelete: "cascade" })
      .notNull(),
    action: varchar("action", { length: 30 }).notNull(), // 'unpublished' | 'warning' | 'reinstated'
    reasonCode: varchar("reason_code", { length: 30 }).notNull(), // 'safe_browsing_flagged' | 'manual_review' | etc.
    source: varchar("source", { length: 30 }).notNull(), // 'cron_rescan' | 'publish_block' | 'admin_manual' | etc.
    details: text("details"),
    rawApiResponse: jsonb("raw_api_response"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("page_moderation_log_page_id_idx").on(table.pageId),
    index("page_moderation_log_created_at_idx").on(table.createdAt),
  ],
);

// ─── stripe_processed_events (webhook deduplication) ─────────────────────────

export const stripeProcessedEvents = pgTable("stripe_processed_events", {
  eventId: varchar("event_id", { length: 255 }).primaryKey(),
  processedAt: timestamp("processed_at", { mode: "date" }).defaultNow().notNull(),
});
