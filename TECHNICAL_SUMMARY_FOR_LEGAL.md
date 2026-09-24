# LinkNest — Technical Summary for Legal Review

**Prepared:** 2026-02-10
**Updated:** 2026-09-23 — added section 9a (content moderation and account suspension); updated section 10 to reflect the published Terms and Privacy pages, the background URL rescan, and session revocation via suspension.
**Source:** Direct inspection of all source files in the LinkNest repository
**Purpose:** Factual reference for drafting Privacy Policy and Terms of Service
**Disclaimer:** This document contains no legal language and no legal advice. All statements describe the current implementation as found in the codebase.

---

## 1) Product Overview

### What the app does

LinkNest is a "link-in-bio" web application. It lets users create a single public webpage (at a URL like `linknest.click/@username`) that contains a curated collection of links, text, headers, images, and dividers. Visitors can view this page and click through to the user's linked destinations.

### Who it is for

Anyone who wants a simple, customizable landing page to consolidate multiple links — commonly used by creators, small businesses, and professionals who share a single URL on social media profiles.

### What users can publish publicly

- A profile page with a title, bio, and avatar image
- Blocks of content: clickable links (with labels and URLs), text sections, headers, dividers, and images
- A custom URL slug (e.g., `@username`)
- Custom SEO metadata (title and description) for search engines

Only pages explicitly marked as "published" by the user are visible to the public. Unpublished pages are not accessible.

---

## 2) Account & Authentication

### How users create accounts

Users can create an account in three ways:

1. **Email and password** — The user provides a name, email address, and password. A verification email is sent. The account cannot be used until the email is verified.
2. **Google OAuth** — The user signs in with their Google account. LinkNest receives the user's name, email, and profile picture from Google.
3. **GitHub OAuth** — Same flow as Google, using GitHub credentials.

A fourth login method exists for returning users:

4. **Magic link** — The user enters their email and receives a one-time sign-in link valid for 24 hours.

After first sign-in, users go through a one-time onboarding flow where they choose a workspace name, a URL slug, and create their first page.

### Authentication methods used

- **NextAuth.js v5** (also known as Auth.js) handles all authentication.
- **JWT-based sessions** — Sessions are stored as signed JSON Web Tokens in browser cookies, not in the database.
- **OAuth** — Standard OAuth 2.0 flows with Google and GitHub.

### Password storage

Passwords are **never stored in plaintext**. They are hashed using **bcrypt with a cost factor of 12** before being saved to the database. Only the hash is stored. For users who sign up via Google, GitHub, or magic link, no password is stored at all.

---

## 3) User-Generated Content

### Types of content users can create

| Content type | Description |
|---|---|
| **Pages** | A profile page with a title, bio, avatar, template, and theme |
| **Link blocks** | A clickable button with a label and destination URL |
| **Header blocks** | A text heading for visual organization |
| **Text blocks** | A paragraph of free-form text |
| **Divider blocks** | A visual separator line |
| **Image blocks** | An uploaded image displayed on the page |
| **Uploaded assets** | Images stored in cloud object storage (avatars, block images) |

### What is public vs. private

- **Public:** Only pages that the user has explicitly published. Visitors see the page title, bio, avatar, and all visible blocks.
- **Private:** Unpublished pages, the dashboard, editor, analytics, billing details, and account information are visible only to the authenticated owner.
- A "LinkNest" badge appears on free-plan pages. Pro users can remove it.

### How content is displayed to visitors

Public pages are server-rendered at the URL `/@username`. The page applies the user's chosen template and theme (colors, fonts, button styles). Visitors see only visible blocks in the order set by the page owner. A click-tracking event is sent to the analytics service when a visitor clicks a link.

---

## 4) Data Collected

### Personal data (account info)

| Data point | Source | Storage |
|---|---|---|
| Name | User-provided or from OAuth provider | `users.name` in database |
| Email address | User-provided or from OAuth provider | `users.email` in database |
| Password hash | User-provided (credentials signup only) | `users.password` in database (bcrypt hash) |
| Profile picture URL | From OAuth provider (Google/GitHub) | `users.image` in database |
| OAuth tokens | From OAuth provider | `accounts` table (access token, refresh token, ID token) |

### Usage data (events, analytics)

| Data point | Service | Notes |
|---|---|---|
| Page views on public pages | PostHog | Automatic `$pageview` events |
| Link clicks on public pages | PostHog | Custom `link_click` events with block ID, URL, and label |

PostHog is configured with `persistence: "memory"` and `autocapture: false`. This means: no cookies are set by PostHog, no data is stored in the visitor's browser, and only the two event types listed above are captured. All analytics state is held in JavaScript memory only and is discarded when the page is closed or navigated away from.

### Technical data (IP, device, logs)

| Data point | Where stored | Purpose |
|---|---|---|
| Reporter IP address | `page_reports.reporterIp` in database | Rate-limiting abuse reports (max 3 per IP per 24 hours) |
| Error stack traces and performance data | Sentry (third-party) | Debugging application errors; sampled at 10% for performance, 100% for error replays |

**Note:** IP addresses are stored in the database only when a visitor submits an abuse report. General visitor IP addresses are not logged or stored by the application. However, PostHog and Sentry may receive IP addresses as part of their standard data collection — this is controlled by those services' own configurations.

### Third-party data

No data is purchased or received from third-party data brokers. The only external data received is:
- User profile information from Google/GitHub during OAuth sign-in
- URL threat classifications from Google Safe Browsing (for links users add to their pages)

---

## 5) Data Storage & Processing

### Where data is stored

| Data type | Provider | Location details |
|---|---|---|
| All structured data (users, pages, blocks, subscriptions, etc.) | **Neon** (serverless PostgreSQL) | Connected via SSL-encrypted HTTP driver |
| Uploaded images | **Cloudflare R2** (S3-compatible object storage) | Images are processed server-side (resized to max 1200px width, converted to WebP at quality 80) before storage |
| Rate-limiting counters | **Upstash Redis** (serverless) | Ephemeral data; counters expire automatically based on rate-limit windows |
| Analytics events | **PostHog** (third-party) | Events are sent to PostHog's servers |
| Error reports | **Sentry** (third-party) | Error data sent to Sentry's servers |

### How long data is retained

- **No explicit data retention policy is implemented in the codebase.** User data, pages, and blocks persist indefinitely unless manually deleted by the user through the editor.
- **Verification tokens** expire after 1 hour and are deleted upon use.
- **Stripe processed events** (deduplication records) are stored indefinitely.
- **Rate-limit counters** in Redis expire automatically (1 minute to 24 hours depending on the limit type).
- **PostHog and Sentry** retain data according to their own retention policies (not controlled by LinkNest).

### Backups and redundancy

No application-level backup system is implemented. Database backups and redundancy depend on Neon's infrastructure. Object storage redundancy depends on Cloudflare R2's infrastructure.

---

## 6) Third-Party Services

| Service | Role | Data shared with service |
|---|---|---|
| **Neon** (PostgreSQL) | Primary database | All application data |
| **Cloudflare R2** | Image/file storage | Uploaded images |
| **Google OAuth** | Authentication provider | Receives auth requests; provides user profile data |
| **GitHub OAuth** | Authentication provider | Receives auth requests; provides user profile data |
| **Emailit** | Transactional email delivery | Recipient email address, email content (sign-in links, verification links) |
| **Stripe** | Payment processing | User email, workspace ID, subscription details. **Card numbers and payment credentials are handled entirely by Stripe and never touch LinkNest servers.** |
| **PostHog** | Product analytics | Page view and link click events from public pages. Configured without cookies or autocapture. |
| **Google Safe Browsing** | URL safety checks | All URLs that users add to their pages are sent to Google for threat classification at publish time |
| **Sentry** | Error monitoring | Application errors, stack traces, performance samples |
| **Upstash** | Rate limiting | Rate-limit counter keys (based on email addresses, IP addresses, or user IDs) |
| **Google Fonts** | Typography | Font files are loaded from Google's servers. Google may log font requests. Fonts used: DM Serif Display, DM Sans. |
| **Vercel** (inferred) | Application hosting | All HTTP traffic passes through the hosting platform |

---

## 7) Cookies & Tracking

### Authentication cookies

NextAuth.js sets **session cookies** in the user's browser. These are:
- **HTTP-only** and **secure** (not accessible to client-side JavaScript)
- Contain a signed JWT with the user's database ID
- Required for the application to function (users cannot stay logged in without them)

### Analytics tracking

PostHog is configured with `persistence: "memory"`, meaning it **does not set any cookies** and **does not use localStorage**. Analytics state exists only in JavaScript memory during a single page visit.

Only two event types are tracked:
1. Automatic page view events on public profile pages
2. Link click events (when a visitor clicks a link on a public page)

### Summary

| Cookie/tracking type | Present? | Purpose | Optional? |
|---|---|---|---|
| Authentication session cookie | Yes | Keeping users logged in | Required for authenticated features |
| PostHog analytics cookies | **No** | N/A (memory-only persistence) | N/A |
| Advertising/marketing cookies | No | N/A | N/A |
| Third-party tracking pixels | No | N/A | N/A |

**There is no cookie consent banner implemented.** Given that the only cookies are essential authentication cookies and PostHog uses memory-only persistence, this may or may not require a consent mechanism depending on jurisdiction — that is a legal determination.

---

## 8) Payments & Subscriptions

### Whether payments exist

Yes. LinkNest operates on a freemium model:

- **Free plan:** $0/month — 1 page, 50 blocks per page, basic templates, 7-day analytics, 50 MB storage
- **Pro plan:** $8/month or $72/year ($6/month) — 5 pages, 100 blocks per page, premium templates, custom colors, Google Fonts, animated buttons, 90-day analytics, 500 MB storage, badge removal

### What data is handled by LinkNest vs. Stripe

| Data | Handled by |
|---|---|
| User's email address | Passed from LinkNest to Stripe when creating a customer |
| Workspace ID | Stored in Stripe checkout session metadata |
| Stripe Customer ID | Stored by LinkNest in `workspaces.stripeCustomerId` |
| Subscription ID, price, status, billing period | Stored by LinkNest in `subscriptions` table |
| Credit card numbers, billing address, payment method details | **Handled entirely by Stripe.** LinkNest never receives, processes, or stores this data. Users enter payment details on Stripe's hosted checkout page. |
| Subscription management (cancel, update card) | Handled via Stripe's hosted billing portal |

---

## 9) Security Measures (High-Level)

### Access controls

- Dashboard and editor routes are protected by authentication middleware — unauthenticated users are redirected to the login page.
- Every data-modifying operation independently verifies that the requesting user owns the workspace and page being modified.
- Email verification is required before password-based login is allowed.

### Encryption

- **In transit:** Database connections require SSL (`sslmode=require`). The application is served over HTTPS (standard for Vercel hosting).
- **At rest:** No application-level encryption of stored data. Data-at-rest encryption depends on the infrastructure providers (Neon, Cloudflare R2, Upstash).
- **Passwords:** Hashed with bcrypt (cost factor 12). Not reversible.

### Rate limiting

| Scope | Limit | Window |
|---|---|---|
| Authentication attempts | 5 per email/IP | 1 minute |
| Verification/magic link emails | 3 per email | 5 minutes |
| Data mutations (create/update/delete) | 30 per user | 1 minute |
| Abuse reports | 3 per IP | 24 hours |

Rate limiting uses Upstash Redis and **degrades gracefully**: if Redis is unavailable, requests are allowed through rather than blocked.

### Input validation

- All user inputs are validated with Zod schemas on the server side.
- URLs are checked against Google Safe Browsing for malware, phishing, and other threats.
- Dangerous URL schemes (`javascript:`, `data:`, `vbscript:`) are blocked.
- File uploads are validated for MIME type and size (max 5 MB).
- Images are processed server-side with Sharp before storage.

### Webhook security

- Stripe webhooks are verified using cryptographic signature validation.
- Events are deduplicated to prevent replay attacks.

---

## 9a) Content Moderation & Account Suspension

### Automated checks

- **At publish time**, every URL on the page is checked against Google Safe Browsing. Publishing is refused if any URL is flagged. If the check times out, the page is published and its URLs are queued in `pending_url_scans`.
- **A daily background job** (04:00 UTC) rescans queued URLs. A page with a flagged URL is unpublished automatically and the owner is told to remove the link and re-publish.
- **Safe Browsing only detects malware, phishing, and similar threats.** It does not detect spam, SEO/backlink pages, gambling, or other Terms violations. There is no automated content or keyword filtering.

### Abuse reports

Every public page shows a "Report this page" link. Reports (reason: phishing, malware, spam, or other, plus optional details) are stored in `page_reports` together with the reporter's IP address. Reports are not acted on automatically.

### Manual takedowns

- An administrator can unpublish a page. Each takedown is recorded in `page_moderation_log` with the action, a reason code, the source (`admin_manual`), a message intended for the owner, and a timestamp. That message is not currently shown to the owner anywhere in the app, and no email is sent. When an owner of a taken-down page tries to publish, they see a generic notice that the page was unpublished for violating the Terms, with a support contact.
- **A page taken down by an administrator cannot be republished by its owner.** Publishing stays blocked until an administrator records a `reinstated` entry for that page.
- Automated unpublishes (plan downgrade, flagged link) do not block republishing; the owner can fix the cause and publish again.
- Takedowns and reinstatements are currently performed directly in the database. There is no admin UI.

### Account suspension

- An administrator can suspend an account by setting `users.suspended_at`.
- A suspended user cannot sign in by any method (password, magic link, Google, GitHub). No magic-link email is sent to a suspended account.
- Existing sessions are re-checked on use, at most 5 minutes apart, so a suspended user's session ends within about 5 minutes of their next visit.
- Suspension does not delete any data: the account, workspace, pages, and blocks are retained. Un-suspending restores access.

### Terms of Service basis

The Terms (section 5, Acceptable Use) prohibit unlawful or malicious content, spam, pages created primarily to build backlinks or manipulate search rankings, and unlicensed gambling, betting, or lottery promotion. They reserve the right to remove or unpublish content and to suspend accounts at LinkNest's sole discretion and without prior notice (sections 5 and 12), and state that content unpublished under the Terms may not be republished without approval.

---

## 10) Known Limitations / Not Yet Implemented

The following items are either incomplete or absent in the current codebase:

| Item | Status |
|---|---|
| **Account deletion / data erasure** | Not implemented. There is no way for users to delete their account or request data removal through the application. |
| **Privacy Policy page** | Published at `/privacy` (last updated February 10, 2026). It does not yet describe moderation or suspension (section 9a). |
| **Terms of Service page** | Published at `/terms` (last updated September 23, 2026). |
| **Cookie consent mechanism** | Not implemented. (May not be needed given the current cookie usage — legal determination required.) |
| **Admin panel / moderation interface** | Takedowns, reinstatements, and suspensions are recorded (see section 9a) but performed directly in the database. There is no admin UI, and owners are not notified (see section 9a). |
| **Content filtering** | No automated detection of spam, backlink pages, gambling, or other Terms violations beyond Safe Browsing (see section 9a). |
| **Data export** | No mechanism for users to export their data. |
| **Email change** | No mechanism for users to change their email address. |
| **Password change / reset** | No password change or reset flow is implemented. |
| **Two-factor authentication** | Not implemented. |
| **Session revocation** | Sessions are JWT-based (stateless). Individual sessions cannot be revoked, but suspending an account ends all of its sessions within about 5 minutes (see section 9a). |
| **Data retention policy** | No automated data retention or deletion rules are implemented. |
| **Audit logging** | No user-facing activity log. Moderation actions are logged internally in `page_moderation_log`; account suspensions record only the time in `users.suspended_at`, with no reason or actor. |
| **Email enumeration** | The registration flow reveals whether an email is already registered ("An account with this email already exists"). The magic link flow does not (it silently succeeds on all inputs). |

---

## Final Verification

- All statements in this document are based on direct inspection of the source code in the repository.
- Where behavior depends on third-party service configuration (PostHog retention, Neon backups, Sentry sampling), this is explicitly noted.
- Items marked as "not implemented" were confirmed absent through full codebase search.
- No legal advice, policy language, or marketing claims are included in this document.
