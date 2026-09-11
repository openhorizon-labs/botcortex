import { expect, test } from "bun:test";

import { type Fetcher, Outbox, type OutboxState } from "@/lib/robot/outbox";

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
  expect(outbox.state).toEqual({ pending: 0, failed: 0, lastFailure: null });
});

test("a rejection is not retried and is reported as failed", async () => {
  const { outbox, calls } = harness([401]);
  expect(await outbox.post("m1", "/api/messages", { id: "m1" })).toBe(false);
  expect(calls).toHaveLength(1);
  expect(outbox.state.failed).toBe(1);
  expect(outbox.state.lastFailure).toContain("signed out");
});

test("bounded retries: gives up after maxAttempts and stays visible", async () => {
  const { outbox, states } = harness([500, 500, 500, 200]);
  expect(await outbox.post("m1", "/api/messages", {})).toBe(false);
  expect(outbox.state).toEqual({ pending: 0, failed: 1, lastFailure: "gave up after 3 attempts" });
  expect(states[0]).toEqual({ pending: 1, failed: 0, lastFailure: null });
});

test("retryFailed drives a failed item again and clears it on success", async () => {
  const { outbox } = harness([500, 500, 500, 200]);
  await outbox.post("m1", "/api/messages", {});
  expect(outbox.state.failed).toBe(1);
  await outbox.retryFailed();
  expect(outbox.state).toEqual({ pending: 0, failed: 0, lastFailure: null });
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
