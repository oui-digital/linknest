import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { activateVerifiedEmail } from "@/lib/signup-admission";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  if (!token || !email) {
    return NextResponse.redirect(new URL("/login?error=invalid-token", req.url));
  }

  // The token is checked and spent in the same transaction that activates
  // the account, under the user row lock (src/lib/signup-admission.ts).
  //
  // Verification is where a password signup becomes an established account,
  // so it is refused when another established account already owns this
  // mailbox under a different spelling. Only the mailbox owner can click this
  // link, so saying so leaks nothing.
  const result = await activateVerifiedEmail(db, { email, token });
  if (result === "invalid_token") {
    return NextResponse.redirect(new URL("/login?error=expired-token", req.url));
  }
  if (result === "conflict") {
    return NextResponse.redirect(new URL("/login?error=identity-conflict", req.url));
  }
  if (result === "not_found") {
    return NextResponse.redirect(new URL("/login?error=invalid-token", req.url));
  }

  return NextResponse.redirect(new URL("/login?verified=true", req.url));
}
