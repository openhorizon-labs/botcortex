/**
 * The boundary between the marketing site and the control room.
 *
 * `/app` and everything under it is the signed-in product; everything else is
 * public. The gate runs both ways:
 *
 *   signed out, inside /app   -> /signin, carrying where you were headed
 *   signed in,  outside /app  -> /app
 *
 * So a session never wanders back onto the marketing site, and every route
 * that needs a login lives at /app/<route> rather than scattered at the root.
 *
 * Cookie *presence* only (fast, no network) — real session validation happens
 * at the api on every call. Next's proxy file convention (middleware.ts is
 * deprecated in this version).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const APP_ROOT = "/app";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = Boolean(getSessionCookie(request));
  const insideApp = pathname === APP_ROOT || pathname.startsWith(`${APP_ROOT}/`);

  if (signedIn && !insideApp) {
    return NextResponse.redirect(new URL(APP_ROOT, request.url));
  }

  if (!signedIn && insideApp) {
    const signin = new URL("/signin", request.url);
    // Carry the destination through sign-in. A robot pairing arrives as
    // /app/device?user_code=XXXX, and dumping a signed-out owner on /app
    // would lose the code they were sent to approve.
    signin.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(signin);
  }

  return NextResponse.next();
}

export const config = {
  // Skip /api (rewritten to botcortex-api — redirecting those would break
  // auth itself), Next's internals, and anything with a file extension
  // (icon.svg, robots.txt, sitemap.xml).
  matcher: ["/((?!api/|_next/|.*\\.).*)"],
};
