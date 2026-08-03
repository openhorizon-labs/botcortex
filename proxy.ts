/**
 * /app is for signed-in owners. Cookie *presence* check only (fast, no
 * network) — real session validation happens at the api on every call.
 * Next's proxy file convention (middleware.ts is deprecated in this version).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const signin = new URL("/signin", request.url);
    // Carry the destination through sign-in. A robot pairing arrives as
    // /device?user_code=XXXX, and dumping a signed-out owner on /app would
    // lose the code they were sent to approve.
    const { pathname, search } = request.nextUrl;
    signin.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(signin);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app", "/device"] };
