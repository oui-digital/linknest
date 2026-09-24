/**
 * Canonical form of an email address, used ONLY as an abuse key.
 *
 * `users.email` stays exactly what the person signed up with (lowercased and
 * trimmed) and is what every login looks up. The canonical form collapses the
 * spellings that deliver to one mailbox — `Some.One+spam@gmail.com` and
 * `someone@gmail.com` — so one mailbox cannot farm many accounts or many
 * rate-limit buckets.
 *
 * Deliberately conservative: sub-address tags are only stripped for providers
 * known to support them, because on other mail servers `+` can be a literal
 * part of a different mailbox. Yahoo is left alone: its disposable addresses
 * use `base-keyword`, and hyphens are common in real addresses.
 */

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/** Providers where `local+tag@domain` delivers to `local@domain`. */
export const PLUS_ADDRESSING_DOMAINS: ReadonlySet<string> = new Set([
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "fastmail.com",
  "fastmail.fm",
  "hey.com",
  "zoho.com",
]);

export function canonicalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0 || at !== email.indexOf("@") || at === email.length - 1) return email;

  let local = email.slice(0, at);
  let domain = email.slice(at + 1);

  if (GMAIL_DOMAINS.has(domain)) {
    local = local.split("+")[0].replace(/\./g, "");
    domain = "gmail.com";
  } else if (PLUS_ADDRESSING_DOMAINS.has(domain)) {
    local = local.split("+")[0];
  }

  // "+tag@" with nothing before the tag is not an address we can collapse.
  return local ? `${local}@${domain}` : email;
}

/** The domain part, lowercased; "" when there is none. */
export function getEmailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).trim().toLowerCase();
}
