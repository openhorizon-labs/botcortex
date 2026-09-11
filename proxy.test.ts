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
