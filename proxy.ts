/**
 * The boundary between the marketing site and the control room.
 *
 * `/app` and everything under it is the signed-in product; everything else is
 * public. The gate runs both ways:
 *
 *   no valid session, inside /app   -> /signin, carrying where you were headed
 *   valid session,    outside /app  -> /app
 *
 * So a session never wanders back onto the marketing site, and every route
 * that needs a login lives at /app/<route> rather than scattered at the root.
 *
 * A cookie being PRESENT is not a session. Deleting an account, revoking a
 * session, or simply letting one expire leaves the browser holding a cookie
 * that a presence check happily waves through — you land in the control room
 * with no account behind you. So a cookie earns one round-trip to the api,
 * and a rejected one is deleted on the way out rather than left to fail the
 * same way on the next navigation.
 *
 * Next's proxy file convention (middleware.ts is deprecated in this version).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const APP_ROOT = "/app";
const API_URL = process.env.API_URL ?? "http://localhost:8787";

/** Better Auth's cookie, plain and __Secure- prefixed (production). */
const SESSION_COOKIES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

function toSignin(request: NextRequest, from: string) {
  const signin = new URL("/signin", request.url);
  // Carry the destination through sign-in. A robot pairing arrives as
  // /app/device?user_code=XXXX, and dumping a signed-out owner on /app
  // would lose the code they were sent to approve.
  signin.searchParams.set("next", from);
  return NextResponse.redirect(signin);
}

/** A rejected session is invalid; an unavailable service leaves it unknown.
 * Both deny entry to /app, but only a rejection should erase the cookie. */
async function sessionState(request: NextRequest): Promise<"valid" | "invalid" | "unavailable"> {
  try {
    const res = await fetch(`${API_URL}/api/me`, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) return "valid";
    return res.status === 401 || res.status === 403 ? "invalid" : "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const insideApp = pathname === APP_ROOT || pathname.startsWith(`${APP_ROOT}/`);
  const hasCookie = Boolean(getSessionCookie(request));

  // No cookie at all: no api call needed, and nothing to clean up.
  if (!hasCookie) {
    return insideApp ? toSignin(request, `${pathname}${search}`) : NextResponse.next();
  }

  const session = await sessionState(request);
  if (session === "unavailable") {
    // An outage is not a revoked login. Keep the cookie, but keep /app closed.
    return insideApp
      ? new NextResponse("Sign-in service is temporarily unavailable. Please retry shortly.", {
          status: 503,
          headers: { "Retry-After": "5", "Cache-Control": "no-store" },
        })
      : NextResponse.next();
  }
  if (session === "valid") {
    return insideApp
      ? NextResponse.next()
      : NextResponse.redirect(new URL(APP_ROOT, request.url));
  }

  // Cookie present but dead. Clear it so the next navigation is a clean
  // signed-out one instead of repeating this round-trip forever.
  const response = insideApp
    ? toSignin(request, `${pathname}${search}`)
    : NextResponse.next();
  for (const name of SESSION_COOKIES) response.cookies.delete(name);
  return response;
}

export const config = {
  // Skip /api (rewritten to botcortex-api — redirecting those would break
  // auth itself), Next's internals, and anything with a file extension
  // (icon.svg, robots.txt, sitemap.xml).
  matcher: ["/app/:path*", "/((?!api/|_next/|.*\\.).*)"],
};
