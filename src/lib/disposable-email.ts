/**
 * Disposable (throwaway) email domains, refused for NEW accounts only —
 * existing users on such a domain keep signing in.
 *
 * Backed by the maintained `disposable-email-domains` list (MIT): index.json
 * holds exact domains, wildcard.json domains whose every subdomain is also
 * disposable. The 2.3 MB main list is imported lazily, so only the signup
 * path pays for parsing it, once per warm instance.
 */

/** Local additions for domains seen in abuse that the upstream list lacks. */
export const EXTRA_BLOCKED_DOMAINS: readonly string[] = [];

export type DisposableLists = {
  exact: ReadonlySet<string>;
  wildcard: ReadonlySet<string>;
};

/**
 * Exact domains match themselves only (the list contains second-level
 * suffixes like net.ee, whose subdomains are unrelated). Wildcard domains
 * also match any subdomain.
 */
export function isDisposableDomain(domain: string, lists: DisposableLists): boolean {
  const d = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!d) return false;
  if (lists.exact.has(d)) return true;
  const labels = d.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    if (lists.wildcard.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

let loaded: Promise<DisposableLists> | null = null;

export function loadDisposableLists(): Promise<DisposableLists> {
  loaded ??= Promise.all([
    import("disposable-email-domains/index.json"),
    import("disposable-email-domains/wildcard.json"),
  ]).then(([exact, wildcard]) => ({
    exact: new Set<string>([...(exact.default as string[]), ...EXTRA_BLOCKED_DOMAINS]),
    wildcard: new Set<string>(wildcard.default as string[]),
  }));
  return loaded;
}

export async function isDisposableEmailDomain(domain: string): Promise<boolean> {
  return isDisposableDomain(domain, await loadDisposableLists());
}
