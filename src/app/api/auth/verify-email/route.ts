import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/tokens";
import { activateVerifiedEmail } from "@/lib/signup-admission";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  if (!token || !email) {
    return NextResponse.redirect(new URL("/login?error=invalid-token", req.url));
  }

  const verified = await verifyToken(email, token);
  if (!verified) {
    return NextResponse.redirect(new URL("/login?error=expired-token", req.url));
  }

  // Verification is where a password signup becomes an established account,
  // so it is refused when another established account already owns this
  // mailbox under a different spelling (src/lib/signup-admission.ts). Only
  // the mailbox owner can click this link, so saying so leaks nothing.
  const result = await activateVerifiedEmail(db, email);
  if (result === "conflict") {
    return NextResponse.redirect(new URL("/login?error=identity-conflict", req.url));
  }
  if (result === "not_found") {
    return NextResponse.redirect(new URL("/login?error=invalid-token", req.url));
  }

  return NextResponse.redirect(new URL("/login?verified=true", req.url));
}
