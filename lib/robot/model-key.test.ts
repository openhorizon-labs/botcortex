import { afterEach, expect, mock, test } from "bun:test";

import { forgetLegacyKey, saveModelKey } from "./model-key";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

function fakeStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  const writes: string[] = [];
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { writes.push(k); data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
  return { data, writes };
}

test("saving a key sends it to our api once and keeps it nowhere in the browser", async () => {
  const { writes } = fakeStorage({});
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = mock(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ key: { provider: "openai", last4: "aaaa", addedAt: 1 }, verified: true }), { status: 200 });
  }) as any;

  const outcome = await saveModelKey("sk-proj-owner0000000000000000aaaa");

  expect(calls).toHaveLength(1);
  // Same-origin, to us — never to a provider from the tab.
  expect(calls[0].url).toBe("/api/model-key");
  expect(calls[0].init.method).toBe("PUT");
  expect(writes).toEqual([]);
  // What comes back, and what the app holds from then on, has no key in it.
  expect(JSON.stringify(outcome)).not.toContain("sk-proj");
  expect(outcome).toMatchObject({ ok: true, key: { provider: "openai", last4: "aaaa" } });
});

test("a key the first version left in this browser is deleted on sight", () => {
  const { data } = fakeStorage({ "botcortex.byo-key": JSON.stringify({ provider: "openai", key: "sk-old", model: "gpt-5.5" }) });
  expect(forgetLegacyKey()).toBe(true);
  expect(data.has("botcortex.byo-key")).toBe(false);
  expect(forgetLegacyKey()).toBe(false);
});

test("a refusal is shown in the api's words", async () => {
  fakeStorage({});
  globalThis.fetch = mock(async () => new Response(JSON.stringify({ error: "OpenAI rejected that key." }), { status: 422 })) as any;
  expect(await saveModelKey("sk-proj-revoked000000000000000000")).toEqual({ ok: false, error: "OpenAI rejected that key." });
});
