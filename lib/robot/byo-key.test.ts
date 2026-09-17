import { afterEach, expect, mock, test } from "bun:test";

import { byoRoute, maskKey } from "@/lib/robot/byo-key";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test("an owner's key goes to its provider, without cookies, and nowhere else", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = mock(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response("{}");
  }) as unknown as typeof fetch;

  const openai = byoRoute({ provider: "openai", key: "sk-test-openai", model: "gpt-5.5" });
  await openai.fetcher(openai.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
  expect(calls[0].init.credentials).toBe("omit");
  expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test-openai");
  expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

  const anthropic = byoRoute({ provider: "anthropic", key: "sk-ant-test", model: "claude-sonnet-5" });
  await anthropic.fetcher(anthropic.endpoint, { method: "POST" });
  const headers = calls[1].init.headers as Record<string, string>;
  expect(calls[1].url).toBe("https://api.anthropic.com/v1/chat/completions");
  expect(headers["x-api-key"]).toBe("sk-ant-test");
  expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
  expect(headers.Authorization).toBeUndefined();

  // The property that matters most: the key cannot be pointed at our own api,
  // or at anything else, by whoever calls the fetcher.
  await expect(openai.fetcher("/api/inference/chat", { method: "POST" })).rejects.toThrow("anywhere but its provider");
  await expect(openai.fetcher("https://example.com/v1/chat/completions")).rejects.toThrow();
  expect(calls).toHaveLength(2);
});

test("a saved key is shown as a hint, never in full", () => {
  expect(maskKey("sk-abcdefghijklmnop1234")).toBe("sk-…1234");
  expect(maskKey("short")).toBe("…");
  expect(maskKey("sk-abcdefghijklmnop1234")).not.toContain("abcdefgh");
});
