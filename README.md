# LinkNest

A link-in-bio SaaS. Users build a public page at `linknest.click/@username` from
drag-and-drop blocks (links, headers, text, images, dividers), style it with a
token-based theme system, publish it, and see view/click analytics.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript |
| Database | Neon serverless Postgres via Drizzle ORM (WebSocket driver) |
| Auth | Auth.js / NextAuth v5 — Google, GitHub, magic link, email+password |
| Storage | Cloudflare R2 (images re-encoded to WebP with sharp) |
| Payments | Stripe Billing (Free / Pro) |
| Analytics | PostHog |
| Rate limiting | Upstash Redis |
| Styling | Tailwind CSS 4 |
| Errors | Sentry |

## Getting started

```bash
pnpm install
cp .env.example .env.local   # then fill it in
pnpm db:push                 # push the Drizzle schema
pnpm dev
```

Open http://localhost:3000.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Production build |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:integration` | Integration tests against a disposable Postgres (`TEST_DATABASE_URL`, required) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm db:push` | Push schema to the database |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm db:seed` | Seed development data |

## Architecture notes

**Routing.** Middleware (`src/middleware.ts`) rewrites `/@slug` to `/slug`, which
serves `src/app/(public)/[username]/page.tsx`, and 301s bare `/slug` back to the
canonical `/@slug`. Build in-app links with `getPublicPageUrl()` from
`src/lib/slugs.ts` so they never take that redirect. Slugs are stored normalized
(lowercased, trimmed) — always write `normalizeSlug()` output, never raw input,
because lookups are case-sensitive.

**Caching.** The public route renders dynamically, so `revalidatePath` does not
apply to it. Page data is cached at the data layer with `unstable_cache` and
invalidated by tag; call `updateTag(publicPageTag(slug))` after any mutation
that changes what a visitor sees.

**Theming.** Templates are code-defined (`src/lib/templates/index.ts`) and supply
default `ThemeTokens`. `pages.theme` stores only the user's *overrides*; the
effective theme is `{...template.defaultTheme, ...page.theme}`. Never persist the
merged theme — doing so shadows every future template switch. Tokens become CSS
custom properties, so `updateTheme` validates them against a closed schema
(values reach a `style` attribute, where a stray `;` injects declarations).

**Entitlements.** `src/lib/entitlements.ts` is the single source of plan limits;
`src/lib/pricing.ts` derives customer-facing copy from it so marketing cannot
drift from what the code enforces. Gates are enforced server-side in the actions
and API routes — client checks are hints only.

**URLs.** User-supplied URLs go through `normalizeUrl()` in
`src/lib/safe-browsing.ts`, which allowlists `http/https/mailto/tel` on the
*parsed* protocol and returns the normalized href. Do not reintroduce pattern
matching: the URL parser strips tabs and newlines, so `java\tscript:` defeats any
anchored regex.

**Reconciliation.** `/api/cron/reconcile` (daily, see `vercel.json`) re-derives
`workspaces.plan` from the canonical `subscriptions` table, enforces page limits
after a downgrade grace period, rescans URLs queued when Safe Browsing timed out,
and prunes old Stripe dedup rows. It requires `CRON_SECRET`.

**Publishing and live edits.** Every link on a published page has passed Safe
Browsing. `publishPageCore` (`src/lib/publish.ts`) and block edits
(`applyLiveEdit` in `src/lib/live-edit.ts`) scan outside the transaction, then
lock the page row: an edit rechecks `is_published`, publish rechecks
`content_version` and moderation holds, and either retries if something moved.
New free pages carry `noindex` and stay out of the sitemap for 14 days after
`first_published_at` (`src/lib/indexing.ts`). User links are always
`rel="nofollow ugc me"`.

**Moderation.** State is a set of holds folded from `page_moderation_log` in
`seq` order (`src/lib/moderation.ts`). An `unpublished` row from `admin_manual`
or `report_threshold` adds a hold named by its `reason_code`
(`manual_review`, `account_suspended`, `user_reports`); a `reinstated` row
clears the same code, or everything with `all`. A page with any hold cannot be
published. Cron unpublishes (plan downgrade, flagged link) are not holds.
Takedowns lock the page row and expire its cache with `{ expire: 0 }`.

There is no admin UI. The API takes `Authorization: Bearer $ADMIN_API_SECRET`:

```bash
curl -X POST "$SITE/api/admin/moderate" -H "Authorization: Bearer $ADMIN_API_SECRET" \
  -H 'content-type: application/json' -d '{"action":"takedown_page","slug":"example","reason":"casino spam"}'
curl -X POST "$SITE/api/admin/moderate" -H "Authorization: Bearer $ADMIN_API_SECRET" \
  -H 'content-type: application/json' -d '{"action":"reinstate_page","slug":"example","reasonCode":"manual_review"}'
curl "$SITE/api/admin/reports?days=7" -H "Authorization: Bearer $ADMIN_API_SECRET"
```

Commands: `takedown_page` / `reinstate_page` (`pageId` or `slug`; reinstate
needs `reasonCode`), `suspend_user` / `reinstate_user` (`userId` or `email`).
Suspending holds every page the user *owns* and drops their session within five
minutes; reinstating lifts only the suspension hold and never republishes.
Alerts go to `ADMIN_ALERT_EMAIL`.

**Schema backfills.** Some schema changes need a one-off SQL step right after
`pnpm db:push`; they live in `scripts/backfills/`, numbered in order.

## Known gaps

Not yet implemented: account deletion, data export, password reset, resend
verification, a moderation UI (moderation is API-only), and custom domains.
