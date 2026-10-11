/**
 * Link attributes for user-supplied outbound links on public pages.
 *
 * Every link used to be a followed backlink ("noopener noreferrer me"). That is
 * the core reason link-in-bio services attract SEO spam: a free account bought
 * a followed link from our domain. Marking them nofollow + ugc removes that
 * incentive — search engines treat the link as a hint, not an endorsement.
 *
 * `me` is an identity claim ("this other URL is also me") that Mastodon and
 * IndieAuth verify by looking for the token. It belongs on the social-icon
 * links, which are the page's profiles, not on every link block: a page that
 * links to a client's site or a product page was claiming those as its own.
 *
 * Deliberately the same for every plan. Offering followed links as a paid perk
 * would make payment the price of a backlink, which Google's link-spam policy
 * treats as selling links, and it would exempt exactly the accounts a spammer
 * would pay for.
 */
export const USER_LINK_REL = "noopener noreferrer nofollow ugc";

/** Social-icon links: the same, plus the identity claim. */
export const IDENTITY_LINK_REL = `${USER_LINK_REL} me`;

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
