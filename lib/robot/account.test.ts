import { afterEach, expect, mock, test } from "bun:test";
import { AccountChangedError, accountFetcher } from "./account";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("an account switch prevents a cached write from reaching the new account", async () => {
  let account = "A";
  const writes: string[] = [];
  globalThis.fetch = (async (url: string) => {
    if (url === "/api/me") return Response.json({ user: { id: account } });
    writes.push(account);
    return new Response();
  }) as typeof fetch;
  const changed = mock(() => {});
  const scoped = accountFetcher("A", new AbortController().signal, changed);
  await scoped("/api/skills", { method: "POST", body: "private-A" });
  account = "B";
  await expect(scoped("/api/skills", { method: "POST", body: "private-A" })).rejects.toBeInstanceOf(AccountChangedError);
  expect(writes).toEqual(["A"]);
  expect(changed).toHaveBeenCalledTimes(1);
});

test("expired sessions are detected before dispatch", async () => {
  const fetcher = mock(async () => new Response(null, { status: 401 }));
  globalThis.fetch = fetcher as unknown as typeof fetch;
  await expect(accountFetcher("A", new AbortController().signal, () => {})("/api/messages")).rejects.toBeInstanceOf(AccountChangedError);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("an account-service outage does not authorize a write or claim an identity change", async () => {
  globalThis.fetch = mock(async () => new Response(null, { status: 503 })) as unknown as typeof fetch;
  const changed = mock(() => {});
  await expect(accountFetcher("A", new AbortController().signal, changed)("/api/messages")).rejects.toThrow("Could not verify");
  expect(changed).not.toHaveBeenCalled();
});

test("a disposed account scope cannot send more requests", async () => {
  const controller = new AbortController();
  const fetcher = mock(async () => new Response());
  globalThis.fetch = fetcher as unknown as typeof fetch;
  controller.abort();
  await expect(accountFetcher("A", controller.signal, () => {})("/api/skills")).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

test("the intended account rides with the write and a server mismatch closes the scope", async () => {
  let expected: string | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (url === "/api/me") return Response.json({ user: { id: "A" } });
    expected = new Headers(init.headers).get("x-botcortex-account");
    return new Response(null, { status: 409, headers: { "x-botcortex-account-mismatch": "1" } });
  }) as typeof fetch;
  const changed = mock(() => {});
  await expect(accountFetcher("A", new AbortController().signal, changed)("/api/skills", { method: "POST" })).rejects.toBeInstanceOf(AccountChangedError);
  expect<string | null>(expected).toBe("A");
  expect(changed).toHaveBeenCalledTimes(1);
});
