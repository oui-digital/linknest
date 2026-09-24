/**
 * What the browser needs to render the Turnstile widget. Derived on the server
 * from the same configuration that governs verification (src/lib/turnstile.ts)
 * and passed down as props, so the client and server can never disagree about
 * whether Turnstile is on.
 *
 * `enabled && siteKey === null` means Turnstile is switched on but
 * misconfigured: the form shows a notice and keeps submit disabled, matching
 * the server, which refuses every token in that state.
 */
export type TurnstileClientConfig = {
  enabled: boolean;
  siteKey: string | null;
};
