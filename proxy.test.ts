import { afterEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const request = () => new NextRequest("http://localhost:3000/app/device?user_code=ABCD", {
  headers: { cookie: "better-auth.session_token=test-session" },
});

test("an auth outage keeps the session cookie and denies access temporarily", async () => {
  globalThis.fetch = mock(async () => new Response("unavailable", { status: 503 })) as unknown as typeof fetch;
  const response = await proxy(request());
  expect(response.status).toBe(503);
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(response.headers.get("retry-after")).toBe("5");
});

test("a revoked session is cleared and preserves the pairing destination", async () => {
  globalThis.fetch = mock(async () => new Response("unauthorized", { status: 401 })) as unknown as typeof fetch;
  const response = await proxy(request());
  expect(response.status).toBe(307);
  expect(new URL(response.headers.get("location")!).searchParams.get("next")).toBe("/app/device?user_code=ABCD");
  expect(response.headers.get("set-cookie")).toContain("better-auth.session_token=");
});

test("valid sessions enter the app", async () => {
  globalThis.fetch = mock(async () => new Response("{}")) as unknown as typeof fetch;
  expect((await proxy(request())).headers.get("x-middleware-next")).toBe("1");
});

test("a queued write cannot switch account between browser lookup and POST", async () => {
  globalThis.fetch = mock(async () => Response.json({ user: { id: "B" } })) as unknown as typeof fetch;
  const request = new NextRequest("http://localhost:3000/api/skills", {
    method: "POST", headers: { cookie: "better-auth.session_token=B", "x-botcortex-account": "A" },
  });
  const response = await proxy(request);
  expect(response.status).toBe(409);
  expect(response.headers.get("x-botcortex-account-mismatch")).toBe("1");
  expect(response.headers.get("x-middleware-next")).toBeNull();
});

test("matching account writes continue without a page redirect", async () => {
  globalThis.fetch = mock(async () => Response.json({ user: { id: "A" } })) as unknown as typeof fetch;
  const response = await proxy(new NextRequest("http://localhost:3000/api/messages", {
    method: "POST", headers: { cookie: "better-auth.session_token=A", "x-botcortex-account": "A" },
  }));
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(response.headers.get("location")).toBeNull();
});
