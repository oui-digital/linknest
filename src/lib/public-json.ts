import { NextRequest, NextResponse } from "next/server";

/**
 * Guards shared by the public JSON endpoints (report, subscribe):
 *
 * - JSON content type only. request.json() parses any body, so without this
 *   the endpoint is a CORS "simple request" that any site could fire from
 *   its visitors' browsers.
 * - Same origin when the browser says where the request came from.
 *
 * Returns a response to send back, or null to continue.
 */
export function rejectCrossSiteJson(request: NextRequest): NextResponse | null {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
  }
  const origin = request.headers.get("origin");
  if (origin) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).host === request.headers.get("host");
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function readJson(request: NextRequest): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
