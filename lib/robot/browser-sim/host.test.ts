import { afterEach, expect, mock, test } from "bun:test";
import { BrowserSim, DEADLINES_MS } from "./host";

const originalWorker = globalThis.Worker;
afterEach(() => { globalThis.Worker = originalWorker; });

const snapshot = {
  contract: JSON.stringify({
    version: "test", system_prompt: "test", max_iterations: 1,
    tools: [{ name: "move_to", description: "move", parameters: { type: "object", properties: {} } }],
  }),
  state: { right: { j1: 0 } }, skills: [], unproven: [], stopped: false,
  scene: { fixtures: {}, objects: {} },
  memory: { durable: true },
};

function workerFixture(failBoot = false, options: { hang?: Set<string> } = {}) {
  const terminated = mock(() => {});
  const requests: Array<{ id: number; type: string; [key: string]: unknown }> = [];
  class FakeWorker {
    onmessage?: (event: { data: unknown }) => void;
    onerror?: (event: { message: string }) => void;
    terminate = terminated;
    postMessage(request: { id: number; type: string }) {
      requests.push(request);
      if (options.hang?.has(request.type)) return;
      queueMicrotask(() => this.onmessage?.({ data: request.type === "boot" && failBoot
        ? { id: request.id, ok: false, error: "bad wheel" }
        : { id: request.id, ok: true, result: request.type === "callTool"
          ? { ...snapshot, output: "ok", plain: "ok", motion: [1, 2, 3].map((j1) => ({ arm: "right", positions: { j1 }, objects: null })) }
          : snapshot },
      }));
    }
  }
  globalThis.Worker = FakeWorker as unknown as typeof Worker;
  return { terminated, requests };
}

test("a failed boot terminates the worker", async () => {
  const { terminated } = workerFixture(true);
  await expect(BrowserSim.boot()).rejects.toThrow("bad wheel");
  expect(terminated).toHaveBeenCalledTimes(1);
});

test("calls made after close reject rather than wait forever", async () => {
  workerFixture();
  const sim = await BrowserSim.boot();
  sim.close();
  await expect(sim.beginTask()).rejects.toThrow("disconnected");
});

test("closing during playback prevents all subsequent frames", async () => {
  workerFixture();
  const sim = await BrowserSim.boot();
  let frames = 0;
  await expect(sim.callTool("move_to", {}, () => { frames++; sim.close(); })).rejects.toThrow("disconnected");
  expect(frames).toBe(1);
  expect(sim.state.right.j1).toBe(1);
});

test("the boot reply's memory report and namespace reach the host", async () => {
  const { requests } = workerFixture();
  const sim = await BrowserSim.boot(() => {}, { namespace: "user-1" });
  expect(requests[0]).toMatchObject({ type: "boot", namespace: "user-1" });
  expect(sim.memory).toEqual({ durable: true });
  sim.close();
});

test("a request that outlives its deadline settles with an error, terminates, and reports once", async () => {
  const { terminated } = workerFixture(false, { hang: new Set(["verify"]) });
  const deaths: string[] = [];
  const sim = await BrowserSim.boot(() => {}, { onDead: (reason) => deaths.push(reason) });
  const original = DEADLINES_MS.verify;
  DEADLINES_MS.verify = 5;
  try {
    await expect(sim.verify()).rejects.toThrow("did not answer \"verify\" within 0 s");
  } finally {
    DEADLINES_MS.verify = original;
  }
  expect(terminated).toHaveBeenCalledTimes(1);
  expect(deaths).toHaveLength(1);
  // Everything after is a plain "disconnected", never a second death report.
  await expect(sim.beginTask()).rejects.toThrow("disconnected");
  expect(deaths).toHaveLength(1);
});

test("a stopped playback rewinds the worker to the SHOWN arm and objects", async () => {
  const { requests } = workerFixture();
  const sim = await BrowserSim.boot();
  sim.scene = { fixtures: {}, objects: { red: { position: [1, 2, 3], orientation: [1, 0, 0, 0], size_m: [0.04, 0.04, 0.04], colour: [1, 0, 0, 1] } } };
  await sim.callTool("move_to", {}, () => { sim.stop(); });
  const seek = requests.find((request) => request.type === "seek");
  expect(seek).toMatchObject({ state: { right: { j1: 1 } }, objects: { red: [1, 2, 3, 1, 0, 0, 0] } });
  sim.close();
});
