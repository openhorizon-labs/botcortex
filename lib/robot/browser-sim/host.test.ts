import { afterEach, expect, mock, test } from "bun:test";
import { BrowserSim, DEADLINES_MS, LIVENESS } from "./host";

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

test("cancellation during boot terminates a worker immediately", async () => {
  const { terminated } = workerFixture(false, { hang: new Set(["boot"]) });
  const abort = new AbortController();
  const booting = BrowserSim.boot(() => {}, { signal: abort.signal });
  abort.abort();
  await expect(booting).rejects.toThrow("disconnected");
  expect(terminated).toHaveBeenCalled();
});

test("a tool call that goes silent is shut down long before the ten-minute ceiling", async () => {
  const { terminated } = workerFixture(false, { hang: new Set(["callTool"]) });
  const deaths: string[] = [];
  const sim = await BrowserSim.boot(() => {}, { onDead: (reason) => deaths.push(reason) });
  const original = LIVENESS.quietMs;
  LIVENESS.quietMs = 20;
  try {
    await expect(sim.callTool("run_skill", {}, () => {})).rejects.toThrow("went silent");
  } finally {
    LIVENESS.quietMs = original;
  }
  expect(terminated).toHaveBeenCalledTimes(1);
  expect(deaths).toHaveLength(1);
});

test("a tool call that keeps pulsing is left alone, and says what it is rehearsing", async () => {
  const { requests } = workerFixture(false, { hang: new Set(["callTool"]) });
  const heard: string[] = [];
  const sim = await BrowserSim.boot(() => {}, { onWorking: (label, step) => heard.push(`${step}: ${label}`) });
  const worker = (sim as unknown as { worker: { onmessage: (e: { data: unknown }) => void } }).worker;
  const original = LIVENESS.quietMs;
  LIVENESS.quietMs = 40;
  try {
    const call = sim.callTool("run_skill", {}, () => {});
    // Well past the quiet limit in total, never silent for as long as it.
    for (let i = 1; i <= 6; i += 1) {
      await new Promise((r) => setTimeout(r, 15));
      worker.onmessage({ data: i === 3 ? { type: "working", label: "moving the arm", step: 2 } : { type: "working" } });
    }
    const id = requests.find((r) => r.type === "callTool")!.id;
    worker.onmessage({ data: { id, ok: true, result: { ...snapshot, output: "ok", plain: "ok", motion: [] } } });
    await expect(call).resolves.toBe("ok");
  } finally {
    LIVENESS.quietMs = original;
  }
  expect(heard).toEqual(["2: moving the arm"]);
});

test("on an isolated page STOP raises a shared flag before it queues its message, and reset lowers it", async () => {
  const { requests } = workerFixture();
  const was = (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated;
  (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated = true;
  try {
    const sim = await BrowserSim.boot();
    expect(sim.stopsMidCompute).toBe(true);
    const flag = new Int32Array((requests.find((r) => r.type === "boot") as unknown as { stopFlag: SharedArrayBuffer }).stopFlag);
    expect(Atomics.load(flag, 0)).toBe(0);
    const stopping = sim.stop();
    // Already up, synchronously: the worker can see it while a tool is still running.
    expect(Atomics.load(flag, 0)).toBe(1);
    await stopping;
    await sim.resetStop();
    expect(Atomics.load(flag, 0)).toBe(0);
  } finally {
    (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated = was;
  }
});

test("without isolation there is no flag, and STOP still works between tool calls", async () => {
  const { requests } = workerFixture();
  const sim = await BrowserSim.boot();
  expect(sim.stopsMidCompute).toBe(false);
  expect("stopFlag" in requests.find((r) => r.type === "boot")!).toBe(false);
  await sim.stop();
  expect(requests.some((r) => r.type === "stop")).toBe(true);
});
