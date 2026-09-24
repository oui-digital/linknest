import { NextResponse, type NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import {
  checkRateLimit,
  authRateLimit,
  emailRateLimit,
} from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

export const GET = handlers.GET;

// The Server Actions in src/lib/actions/auth.ts rate limit their own calls, but
// these raw NextAuth endpoints are reachable directly and the middleware matcher
// excludes /api entirely. Unthrottled, they allow unlimited password guessing
// against /callback/credentials and unlimited outbound mail via /signin/email —
// the latter turning the app into an open relay against arbitrary addresses.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  const { nextauth } = await context.params;
  const route = nextauth?.join("/") ?? "";

  // Magic links are requested only through the sendMagicLink Server Action,
  // which verifies Turnstile and applies new-account admission, then calls
  // signIn("email") in-process — it never reaches this handler. The HTTP
  // endpoint was therefore just a way around those checks.
  if (route === "signin/email") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const ip = await getClientIp();

  if (route === "callback/credentials") {
    const rl = await checkRateLimit(authRateLimit, `ip:${ip}`);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 },
      );
    }
  }

  if (route === "callback/email") {
    const rl = await checkRateLimit(emailRateLimit, `ip:${ip}`);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 },
      );
    }
  }

  return handlers.POST(request);
}
