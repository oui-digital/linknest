/**
 * Link attributes for user-supplied outbound links on public pages.
 *
 * Every link used to be a followed backlink ("noopener noreferrer me"). That is
 * the core reason link-in-bio services attract SEO spam: a free account bought
 * a followed link from our domain. Marking them nofollow + ugc removes that
 * incentive — search engines treat the link as a hint, not an endorsement —
 * while `me` stays so Mastodon/IndieAuth rel="me" verification keeps working
 * (those verifiers only check that the token is present).
 *
 * Deliberately the same for every plan. Offering followed links as a paid perk
 * would make payment the price of a backlink, which Google's link-spam policy
 * treats as selling links, and it would exempt exactly the accounts a spammer
 * would pay for.
 */
export const USER_LINK_REL = "noopener noreferrer nofollow ugc me";

/**
 * Whether a link opens a web page (and so gets target="_blank" and rel).
 *
 * tel: and mailto: hand off to another app. Opening them in a new tab leaves
 * the visitor staring at a blank page behind the dialer or mail client — on
 * desktop it is simply a dead tab. Only http(s) destinations get _blank.
 */
export function isExternalPage(url: string): boolean {
  return /^https?:/i.test(url);
}
