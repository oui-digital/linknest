import { sendSubscribeConfirmationEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { unsubscribeTokenFor, type SendClaim } from "@/lib/subscribers";

export function confirmUrlFor(rawToken: string): string {
  return `${SITE_URL}/subscribe/confirm?token=${rawToken}`;
}

export function unsubscribeUrlFor(subscriberId: string): string {
  return `${SITE_URL}/subscribe/unsubscribe?id=${subscriberId}&token=${unsubscribeTokenFor(subscriberId)}`;
}

/** The real sender used by the subscribe route and the retry cron. */
export async function sendConfirmation(claim: SendClaim): Promise<void> {
  await sendSubscribeConfirmationEmail({
    to: claim.email,
    pageTitle: claim.pageTitle,
    slug: claim.slug,
    confirmUrl: confirmUrlFor(claim.rawConfirmToken),
    unsubscribeUrl: unsubscribeUrlFor(claim.subscriberId),
  });
}
