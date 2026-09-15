import { expect, test } from "bun:test";

import { type Fetcher, Outbox, type OutboxJournal, type OutboxState } from "@/lib/robot/outbox";

function harness(responses: Array<number | "network">) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const states: OutboxState[] = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    const next = responses.shift();
    if (next === "network" || next === undefined) throw new TypeError("Failed to fetch");
    return new Response(null, { status: next });
  };
  const outbox = new Outbox({
    fetch: fetcher,
    maxAttempts: 3,
    sleep: async () => {},
    onChange: (state) => states.push(state),
  });
  return { outbox, calls, states };
}

test("a transient failure is retried under the same key and creates one row", async () => {
  const { outbox, calls } = harness([503, "network", 200]);
  const saved = await outbox.post("m1", "/api/messages", { id: "m1" });
  expect(saved).toBe(true);
  expect(calls).toHaveLength(3);
  expect(new Set(calls.map((call) => JSON.stringify(call.body))).size).toBe(1);
  expect(outbox.state).toEqual({ pending: 0, failed: 0, lastFailure: null, stalled: 0 });
});

test("a rejection is not retried and is reported as failed", async () => {
  const { outbox, calls } = harness([401]);
  expect(await outbox.post("m1", "/api/messages", { id: "m1" })).toBe(false);
  expect(calls).toHaveLength(1);
  expect(outbox.state.failed).toBe(1);
  expect(outbox.state.lastFailure).toContain("signed out");
});

test("a transient failure is never given up on: past maxAttempts it is stalled, still pending, and saves when the api returns", async () => {
  const { outbox, states, calls } = harness([500, 500, 500, 503, "network", 200]);
  expect(await outbox.post("m1", "/api/messages", {})).toBe(true);
  expect(calls).toHaveLength(6);
  expect(states[0]).toEqual({ pending: 1, failed: 0, lastFailure: null, stalled: 0 });
  // Crossing maxAttempts is reported as stalled, not failed, and says why.
  expect(states.some((state) => state.stalled === 1 && state.failed === 0 && state.pending === 1)).toBe(true);
  expect(states.some((state) => state.lastFailure?.includes("still trying"))).toBe(true);
  expect(outbox.state).toEqual({ pending: 0, failed: 0, lastFailure: null, stalled: 0 });
});

test("retryFailed drives a failed item again and clears it on success", async () => {
  const { outbox } = harness([400, 200]);
  await outbox.post("m1", "/api/messages", {});
  expect(outbox.state.failed).toBe(1);
  await outbox.retryFailed();
  expect(outbox.state).toEqual({ pending: 0, failed: 0, lastFailure: null, stalled: 0 });
});

test("a nudge wakes a sleeping retry immediately", async () => {
  let sent = 0;
  let slept = 0;
  const outbox = new Outbox({
    fetch: async () => new Response(null, { status: sent++ === 0 ? 503 : 200 }),
    // A real wait: only the nudge can end it.
    sleep: (ms) => { slept = ms; return new Promise((resolve) => setTimeout(resolve, ms)); },
    backoff: () => 60_000,
  });
  const sending = outbox.post("m1", "/api/messages", {});
  await Bun.sleep(5);
  expect(sent).toBe(1);
  outbox.nudge();
  expect(await sending).toBe(true);
  expect(slept).toBe(60_000);
  expect(sent).toBe(2);
});

test("the journal carries pending writes across a reload and drops them once saved", async () => {
  const store = new Map<string, string>();
  const journal: OutboxJournal = { load: () => store.get("j") ?? null, save: (s) => { store.set("j", s); } };
  // First life: the api is down, the write stays pending in the journal.
  const down = new Outbox({ fetch: async () => new Response(null, { status: 503 }), journal, sleep: () => new Promise(() => {}) });
  void down.post("m1", "/api/messages", { id: "m1", text: "hello" });
  await Bun.sleep(1);
  expect(JSON.parse(store.get("j")!)).toEqual([{ key: "m1", url: "/api/messages", serialized: JSON.stringify({ id: "m1", text: "hello" }) }]);
  down.dispose();
  // Second life: resume replays it under the same key with the same body.
  const calls: unknown[] = [];
  const up = new Outbox({ fetch: async (_url, init) => { calls.push(JSON.parse(String(init.body))); return new Response(null, { status: 200 }); }, journal, sleep: async () => {} });
  expect(up.resume()).toBe(1);
  await Bun.sleep(1);
  expect(calls).toEqual([{ id: "m1", text: "hello" }]);
  expect(up.state.pending).toBe(0);
  expect(store.get("j")).toBe("[]");
  // A rejected write is not journalled: replaying it would fail again.
  const rejecting = new Outbox({ fetch: async () => new Response(null, { status: 400 }), journal, sleep: async () => {} });
  await rejecting.post("bad", "/api/messages", {});
  expect(store.get("j")).toBe("[]");
});

test("posting the same key while it is in flight does not double-send", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let sent = 0;
  const outbox = new Outbox({
    fetch: async () => { sent++; await gate; return new Response(null, { status: 200 }); },
    sleep: async () => {},
  });
  const first = outbox.post("m1", "/api/messages", {});
  const second = outbox.post("m1", "/api/messages", {});
  release();
  await Promise.all([first, second]);
  expect(sent).toBe(1);
});

test("a hanging request times out and is tried again", async () => {
  const signals: AbortSignal[] = [];
  const outbox = new Outbox({
    attemptTimeoutMs: 5, maxAttempts: 2, sleep: async () => {},
    fetch: async (_url, init) => {
      signals.push(init.signal!);
      return signals.length < 3 ? new Promise(() => {}) : new Response(null, { status: 200 });
    },
  });
  expect(await outbox.post("one", "/api/messages", {})).toBe(true);
  expect(signals).toHaveLength(3);
  expect(signals.slice(0, 2).every((signal) => signal.aborted)).toBe(true);
  expect(outbox.state).toEqual({ pending: 0, failed: 0, lastFailure: null, stalled: 0 });
});

test("disposal aborts an in-flight request and prevents retries", async () => {
  let sent = 0;
  const outbox = new Outbox({ fetch: async () => { sent++; return new Promise(() => {}); } });
  const sending = outbox.post("one", "/api/messages", {});
  outbox.dispose();
  expect(await sending).toBe(false);
  await outbox.retryFailed();
  expect(await outbox.post("two", "/api/messages", {})).toBe(false);
  expect(sent).toBe(1);
});

test("disposal also cancels backoff", async () => {
  let sent = 0;
  const outbox = new Outbox({ fetch: async () => { sent++; return new Response(null, { status: 503 }); } });
  const sending = outbox.post("one", "/api/messages", {});
  await Bun.sleep(1);
  outbox.dispose();
  expect(await sending).toBe(false);
  expect(sent).toBe(1);
});

test("a retry cannot change the captured body under a dedup key", async () => {
  const { outbox, calls } = harness([400, 200]);
  const body = { text: "original" };
  await outbox.post("one", "/api/messages", body);
  body.text = "mutated";
  await outbox.post("one", "/different", { text: "replacement" });
  await outbox.retryFailed();
  expect(calls).toEqual([{ url: "/api/messages", body: { text: "original" } }, { url: "/api/messages", body: { text: "original" } }]);
});
