import type { TurnstileClientConfig } from "@/lib/turnstile-types";

/**
 * Cloudflare Turnstile verification.
 *
 * Rollout is an explicit switch, TURNSTILE_ENABLED=true. Off: every check
 * passes and no widget renders. On with incomplete configuration: every check
 * FAILS and the forms say verification is unavailable — a missing secret must
 * never silently disable bot protection in production.
 *
 * Hostnames are allowlisted per deployment (TURNSTILE_ALLOWED_HOSTNAMES), not
 * inferred from NODE_ENV, which is "production" on Preview deployments too.
 * TURNSTILE_TEST_MODE=true lets Cloudflare's dummy keys through the action and
 * hostname checks; it is ignored when VERCEL_ENV=production.
 */

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_FAILED_ERROR = "Verification failed. Please try again.";
const MAX_TOKEN_LENGTH = 2048;

export type TurnstileConfig =
  | { state: "disabled" }
  | { state: "misconfigured"; reason: string }
  | {
      state: "enabled";
      siteKey: string;
      secretKey: string;
      allowedHostnames: string[];
      testMode: boolean;
    };

export function parseAllowedHostnames(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function resolveTurnstileConfig(
  env: Record<string, string | undefined>,
): TurnstileConfig {
  if (env.TURNSTILE_ENABLED !== "true") return { state: "disabled" };

  const siteKey = env.TURNSTILE_SITE_KEY?.trim();
  const secretKey = env.TURNSTILE_SECRET_KEY?.trim();
  const testMode = env.TURNSTILE_TEST_MODE === "true" && env.VERCEL_ENV !== "production";
  const allowedHostnames = parseAllowedHostnames(env.TURNSTILE_ALLOWED_HOSTNAMES);

  if (!siteKey) return { state: "misconfigured", reason: "TURNSTILE_SITE_KEY is not set" };
  if (!secretKey) return { state: "misconfigured", reason: "TURNSTILE_SECRET_KEY is not set" };
  if (!testMode && allowedHostnames.length === 0) {
    return { state: "misconfigured", reason: "TURNSTILE_ALLOWED_HOSTNAMES is not set" };
  }
  return { state: "enabled", siteKey, secretKey, allowedHostnames, testMode };
}

export function clientConfigFor(config: TurnstileConfig): TurnstileClientConfig {
  switch (config.state) {
    case "disabled":
      return { enabled: false, siteKey: null };
    case "misconfigured":
      return { enabled: true, siteKey: null };
    case "enabled":
      return { enabled: true, siteKey: config.siteKey };
  }
}

export type SiteverifyOutcome = { ok: true } | { ok: false; reason: string };

/** Decide a Siteverify response. Undefined options skip that check. */
export function evaluateSiteverifyResult(
  result: unknown,
  { expectedAction, allowedHostnames }: { expectedAction?: string; allowedHostnames?: readonly string[] },
): SiteverifyOutcome {
  if (!result || typeof result !== "object") return { ok: false, reason: "malformed response" };
  const r = result as { success?: unknown; action?: unknown; hostname?: unknown; "error-codes"?: unknown };
  if (r.success !== true) {
    const codes = Array.isArray(r["error-codes"]) ? r["error-codes"].join(",") : "none";
    return { ok: false, reason: `not successful (${codes})` };
  }
  if (expectedAction !== undefined && r.action !== expectedAction) {
    return { ok: false, reason: `action mismatch (${String(r.action)})` };
  }
  if (
    allowedHostnames !== undefined &&
    !(typeof r.hostname === "string" && allowedHostnames.includes(r.hostname.toLowerCase()))
  ) {
    return { ok: false, reason: `hostname not allowed (${String(r.hostname)})` };
  }
  return { ok: true };
}

const serverConfig = resolveTurnstileConfig(process.env);
if (serverConfig.state === "misconfigured") {
  console.error(
    `[turnstile] TURNSTILE_ENABLED=true but ${serverConfig.reason}. ` +
      "Every protected form is refusing submissions until this is fixed.",
  );
}

/** For server components: the widget configuration to pass to the client. */
export function getTurnstileClientConfig(): TurnstileClientConfig {
  return clientConfigFor(serverConfig);
}

/**
 * Verify a Turnstile token server-side. Fails closed on any network error,
 * non-2xx status or unparseable body.
 */
export async function verifyTurnstileToken(
  {
    token,
    remoteIp,
    action,
  }: { token: unknown; remoteIp?: string; action: string },
  {
    config = serverConfig,
    fetchImpl = fetch,
  }: { config?: TurnstileConfig; fetchImpl?: typeof fetch } = {},
): Promise<SiteverifyOutcome> {
  if (config.state === "disabled") return { ok: true };
  if (config.state === "misconfigured") return { ok: false, reason: config.reason };

  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: "missing or oversized token" };
  }

  const body = new URLSearchParams({ secret: config.secretKey, response: token });
  if (remoteIp && remoteIp !== "unknown") body.set("remoteip", remoteIp);

  let result: unknown;
  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { ok: false, reason: `siteverify HTTP ${response.status}` };
    result = await response.json();
  } catch (error) {
    return { ok: false, reason: `siteverify unreachable (${(error as Error).name})` };
  }

  return evaluateSiteverifyResult(
    result,
    config.testMode
      ? {}
      : { expectedAction: action, allowedHostnames: config.allowedHostnames },
  );
}
