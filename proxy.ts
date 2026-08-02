/**
 * /app is for signed-in owners. Cookie *presence* check only (fast, no
 * network) — real session validation happens at the api on every call.
 * Next's proxy file convention (middleware.ts is deprecated in this version).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app"] };
