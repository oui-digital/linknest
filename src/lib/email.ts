import { SITE_URL } from "@/lib/site";

const EMAILIT_API_KEY = process.env.EMAILIT_API_KEY!;
const FROM = process.env.EMAIL_FROM || "LinkNest <noreply@linknest.click>";
const APP_URL = SITE_URL;

/** Escape user-supplied text before it is interpolated into an email body. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const res = await fetch("https://api.emailit.com/v2/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${EMAILIT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to,
      subject,
      html,
      // Every email this app sends is an authentication email, and click
      // tracking BREAKS them. Emailit rewrites each href to
      // https://go.linknest.click/<id>, so the real sign-in URL — token and all
      // — only exists behind a redirect. That means:
      //   * inbox scanners and link previewers that pre-fetch the tracked URL
      //     burn the single-use token before the recipient ever clicks;
      //   * the query string carrying `token` and `email` survives only if the
      //     tracker reproduces it exactly;
      //   * the visible link is an opaque domain, which is precisely the shape
      //     users are taught to distrust in a sign-in email.
      // Open tracking is disabled too: there is no product reason to log when
      // someone reads their own login email.
      tracking: { loads: false, clicks: false },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[email] Emailit API error (${res.status}):`, body);
    throw new Error(`Emailit API error (${res.status}): ${body}`);
  }
}

export async function sendMagicLinkEmail({
  to,
  url,
}: {
  to: string;
  url: string;
}) {
  await sendEmail({
    to,
    subject: "Sign in to LinkNest",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="margin-bottom: 24px;">Sign in to LinkNest</h2>
        <p style="color: #555; line-height: 1.6;">
          Click the button below to sign in to your LinkNest account.
          This link expires in 24 hours.
        </p>
        <a href="${url}"
           style="display: inline-block; margin: 24px 0; padding: 12px 32px;
                  background: #000; color: #fff; text-decoration: none;
                  border-radius: 8px; font-weight: 600;">
          Sign in to LinkNest
        </a>
        <p style="color: #999; font-size: 13px; margin-top: 32px;">
          If you didn't request this email, you can safely ignore it.
        </p>
      </div>
    `,
  });
}

export async function sendVerificationEmail({
  to,
  token,
}: {
  to: string;
  token: string;
}) {
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(to)}`;

  await sendEmail({
    to,
    subject: "Verify your LinkNest account",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="margin-bottom: 24px;">Verify your email</h2>
        <p style="color: #555; line-height: 1.6;">
          Thanks for creating a LinkNest account. Click the button below
          to verify your email address. This link expires in 1 hour.
        </p>
        <a href="${verifyUrl}"
           style="display: inline-block; margin: 24px 0; padding: 12px 32px;
                  background: #000; color: #fff; text-decoration: none;
                  border-radius: 8px; font-weight: 600;">
          Verify email address
        </a>
        <p style="color: #999; font-size: 13px; margin-top: 32px;">
          If you didn't create a LinkNest account, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

/**
 * Operational alert to the site owner (reports, link-farm signals, takedowns).
 *
 * Unset ADMIN_ALERT_EMAIL is not an error: the alert is logged instead, so the
 * signal still reaches the function logs. Callers run this after the response
 * (or in a try/catch) — an Emailit hiccup must never fail a report or publish.
 *
 * Never put ADMIN_API_SECRET in `html`. Curl examples reference the env var.
 */
export async function sendAdminAlert({
  subject,
  html,
}: {
  subject: string;
  html: string;
}) {
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!to) {
    console.warn(`[admin-alert] ADMIN_ALERT_EMAIL is not set. ${subject}`);
    return;
  }
  await sendEmail({ to, subject: `[LinkNest] ${subject}`, html });
}

const TAKEDOWN_REASON_TEXT: Record<string, string> = {
  manual_review:
    "It was reviewed by the LinkNest team and found to violate our Terms of Service.",
  user_reports:
    "It received several reports from visitors and is unpublished while we review it.",
};

/**
 * Tell a page owner their page was taken down. Sent only when a takedown
 * actually changed the page (never on a repeat), so the owner gets one email.
 */
export async function sendPageTakedownEmail({
  to,
  slug,
  reasonCode,
}: {
  to: string;
  slug: string;
  reasonCode: string;
}) {
  const reason =
    TAKEDOWN_REASON_TEXT[reasonCode] ??
    "It was found to violate our Terms of Service.";
  await sendEmail({
    to,
    subject: `Your LinkNest page @${slug} was unpublished`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="margin-bottom: 24px;">Your page was unpublished</h2>
        <p style="color: #555; line-height: 1.6;">
          Your LinkNest page <strong>@${escapeHtml(slug)}</strong> is no longer public.
          ${escapeHtml(reason)}
        </p>
        <p style="color: #555; line-height: 1.6;">
          If you think this is a mistake, reply to support@linknest.click and
          include your page address.
        </p>
      </div>
    `,
  });
}
